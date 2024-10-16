import {
  AccessRecord,
  CheckedTypeExpression,
  DependencyManager,
  EnumDeclaration,
  EnumType,
  EnumTypeAtomVariant,
  EnumTypeStructVariant,
  EnumTypeTupleVariant,
  File,
  FunctionType,
  FunctionTypeParameter,
  NominalType,
  StructDeclaration,
  StructField,
  StructType,
  Symbol,
  TypeExpression,
  TypeParameterType,
  UncheckedFunctionType,
  UncheckedNominalType,
  UncheckedTypeExpression,
  UncheckedTypeParameterType
} from "../ast.js";
import {Map, Seq} from 'immutable';


/**
 * Given this file of parsed things, return a map of all symbols with their access level and type
 */
export function collectSymbols(files: File[], manager: DependencyManager, preamble: Map<string, Symbol>): Map<Symbol, AccessRecord> {
  const declarations = Map<Symbol, AccessRecord>().asMutable();

  files.forEach(file => {

    const module = file.module;
    const qualifier = new Qualifier(collectDeclarations(file, manager, preamble));

    // now qualify all types with these other found types, so that we can export that information outside
    file.declarations.forEach(dec => {
      switch (dec.kind) {
        case 'import':
          // imports are never exported
          break;
        case 'struct': {
          const checked = qualifier.qualifyStruct(file.module, dec);
          declarations.set(checked.name, {
            access: dec.access,
            module,
            type: checked,
          });

          checked.typeParams.forEach(param => {
            declarations.set(param.name, {
              access: 'public',
              module,
              type: param,
            });
          });

          break;
        }
        case 'enum': {
          const checked = qualifier.qualifyEnum(file.module, dec);
          declarations.set(checked.name, {
            access: dec.access,
            module,
            type: checked,
          });

          checked.typeParams.forEach(param => {
            declarations.set(param.name, {
              access: 'public',
              module,
              type: param,
            });
          });

          checked.variants.valueSeq().forEach(varient => {
            declarations.set(varient.name, {
              access: dec.access,
              module,
              type: varient,
            });
          });
          break;
        }
        case 'const':
          declarations.set(file.module.child(dec.name), {
            access: dec.access,
            module,
            type: qualifier.checkTypeExpression(dec.type),
          });
          break;
        case 'function':
          const name = file.module.child(dec.name);

          declarations.set(name, {
            access: dec.access,
            module,
            type: {
              pos: dec.pos,
              kind: 'function',
              phase: dec.phase,
              typeParams: dec.typeParams.map(it => qualifier.checkTypeExpression(it)),
              params: dec.params.map(it => {
                return {
                  pos: it.pos,
                  phase: it.phase,
                  type: qualifier.checkTypeExpression(it.type!!),
                } satisfies FunctionTypeParameter;
              }),
              result: qualifier.checkTypeExpression(dec.resultType),
            } satisfies FunctionType,
          });

          dec.typeParams.forEach(param => {
            const paramName = name.child(param.name);

            declarations.set(paramName, {
              access: 'public',
              module,
              type: {
                pos: param.pos,
                kind: 'typeParameter',
                name: paramName,
              } satisfies TypeParameterType,
            });
          });
          break;
      }
    });
  });

  return declarations.asImmutable();
}

export function collectDeclarations(file: File, manager: DependencyManager, preamble: Map<string, Symbol>): Map<string, Symbol> {
  const usableTypes = preamble.asMutable();

  // fill the scope with all types and values we find, both imported and declared locally
  file.declarations.forEach(dec => {
    if (dec.kind === 'import') {
      manager.breakdownImport(dec).forEach(it => {
        usableTypes.set(it.name, it);
      })
    } else {
      usableTypes.set(dec.name, file.module.child(dec.name));
    }
  });

  return usableTypes.asImmutable();
}

export class Qualifier {

  readonly #dict: Map<string, Symbol>;

  constructor(dict: Map<string, Symbol>) {
    this.#dict = dict;
  }

  qualifyStruct(module: Symbol, dec: StructDeclaration): StructType {
    return {
      pos: dec.pos,
      kind: 'struct',
      name: module.child(dec.name),
      typeParams: dec.typeParams.map(it => this.#checkTypeParamType(it)),
      fields: this.#qualifyStructFields(dec.fields),
    };
  }

  #qualifyStructFields(fields: Map<string, StructField>): Map<string, TypeExpression> {
    return fields.map(field => this.checkTypeExpression(field.type));
  }

  qualifyEnum(module: Symbol, dec: EnumDeclaration): EnumType {
    const name = module.child(dec.name);

    return {
      pos: dec.pos,
      kind: 'enum',
      name,
      typeParams: dec.typeParams.map(it => this.#checkTypeParamType(it)),
      variants: dec.variants.map((variant, key) => {
        switch (variant.kind) {
          case "atom":
            return {
              pos: variant.pos,
              kind: 'enumAtom',
              name: name.child(key),
            } satisfies EnumTypeAtomVariant;
          case 'struct':
            return {
              pos: variant.pos,
              kind: 'enumStruct',
              name: name.child(key),
              fields: this.#qualifyStructFields(variant.fields),
            } satisfies EnumTypeStructVariant;
          case 'tuple':
            return {
              pos: variant.pos,
              kind: 'enumTuple',
              name: name.child(key),
              fields: variant.fields.map(it => this.checkTypeExpression(it))
            } satisfies EnumTypeTupleVariant;
        }
      }),
    };
  }

  checkTypeExpression<Ex extends UncheckedTypeExpression>(ex: Ex): CheckedTypeExpression<Ex> {
    // the results here are always cast because while we know that if the input is UncheckedNominalType the output must be NominalType
    // typescript isn't quite smart enough to work that out
    switch (ex.kind) {
      case "nominal":
        return this.#checkNominalType(ex) as CheckedTypeExpression<Ex>;
      case 'typeParameter':
        return this.#checkTypeParamType(ex) as CheckedTypeExpression<Ex>;
      case 'parameterized':
        return {
          kind: 'parameterized',
          pos: ex.pos,
          base: this.#checkNominalType(ex.base),
          args: ex.args.map(it => this.checkTypeExpression(it)),
        } as CheckedTypeExpression<Ex>;
      case 'function':
        return this.#checkFunctionType(ex) as CheckedTypeExpression<Ex>;
      case "overloadFunction":
        return {
          pos: ex.pos,
          kind: 'overloadFunction',
          branches: ex.branches.map(it => this.#checkFunctionType(it)),
        } as CheckedTypeExpression<Ex>;
    }
  }

  #checkNominalType(ex: UncheckedNominalType): NominalType {
    const base = this.#dict.get(ex.name.at(0)!!.name) ?? ex.pos.fail(`Could not find type with name ${ex.name.at(0)!!.name} in scope`);

    return {
      kind: 'nominal',
      pos: ex.pos,
      name: Seq(ex.name).skip(1).reduce((prev, next) => prev.child(next.name), base),
    }
  }

  #checkTypeParamType(ex: UncheckedTypeParameterType): TypeParameterType {
    const base = this.#dict.get(ex.name) ?? ex.pos.fail(`Could not find type with name ${ex.name} in scope`);

    return {
      kind: 'typeParameter',
      pos: ex.pos,
      name: base.child(ex.name),
    }
  }

  #checkFunctionType(ex: UncheckedFunctionType): FunctionType {
    return {
      pos: ex.pos,
      kind: 'function',
      phase: ex.phase,
      // this type is only used in places that are not allowed to define type params, so we don't need to deal with it
      typeParams: [],
      params: ex.params.map(param => {
        return {
          pos: param.pos,
          phase: param.phase,
          type: this.checkTypeExpression(param.type),
        }
      }),
      result: this.checkTypeExpression(ex.result),
    }
  }
}

