import { List, Map } from 'immutable';
import type { DependencyManager, Symbol } from '../ast.ts';
import {
  ParserAtom,
  type ParserConcreteType,
  ParserConstantDeclare,
  ParserDataDeclare,
  type ParserDataLayout,
  ParserEnumDeclare,
  type ParserFile,
  ParserFunctionDeclare,
  ParserFunctionType,
  ParserImplDeclare,
  ParserImportDeclaration,
  ParserNominalType,
  ParserParameterizedType,
  ParserStruct,
  type ParserStructField,
  ParserTuple,
  type ParserTypeExpression,
  ParserTypeParameterType
} from '../parser/parserAst.ts';
import {
  CheckedAccessRecord,
  CheckedAtomType,
  type CheckedConcreteType,
  type CheckedDataLayoutType,
  CheckedEnumType,
  CheckedFunctionDeclare,
  CheckedFunctionType,
  CheckedFunctionTypeParameter,
  CheckedNominalType,
  CheckedParameterizedType,
  CheckedStructType,
  CheckedTupleType,
  type CheckedTypeExpression,
  CheckedTypeParameterType
} from './checkerAst.ts';

/**
 * Given this file of parsed things, return a map of all symbols with their access level and type
 */
export function collectSymbols(files: List<ParserFile>, manager: DependencyManager, preamble: Map<string, Symbol>): { symbols: Map<Symbol, CheckedAccessRecord>, methods: Map<Symbol, Map<string, CheckedAccessRecord>> } {
  const declarations = Map<Symbol, CheckedAccessRecord>().asMutable();
  const methods = Map<Symbol, Map<string, CheckedAccessRecord>>().asMutable();

  files.forEach(file => {
    const qualifier = new Qualifier(collectDeclarations(file, manager, preamble));

    // now qualify all types with these other found types, so that we can export that information outside
    file.declarations.forEach(dec => {
      if (dec instanceof ParserImportDeclaration) {
        // imports are never exported
      } else if (dec instanceof ParserDataDeclare) {
        const checked = qualifier.qualifyData(file.module, dec);
        declarations.set(checked.name, new CheckedAccessRecord({
          access: dec.access,
          name: checked.name,
          module: file.module,
          type: checked,
        }));

        checked.typeParams.forEach(param => {
          declarations.set(param.name, new CheckedAccessRecord({
            access: 'public',
            name: param.name,
            module: file.module,
            type: param,
          }));
        });
      } else if (dec instanceof ParserEnumDeclare) {
        const checked = qualifier.qualifyEnum(file.module, dec);
        declarations.set(checked.name, new CheckedAccessRecord({
          access: dec.access,
          name: checked.name,
          module: file.module,
          type: checked,
        }));

        checked.typeParams.forEach(param => {
          declarations.set(param.name, new CheckedAccessRecord({
            access: 'public',
            name: param.name,
            module: file.module,
            type: param,
          }));
        });

        checked.variants.valueSeq().forEach(varient => {
          declarations.set(varient.name, new CheckedAccessRecord({
            access: dec.access,
            name: varient.name,
            module: file.module,
            type: varient,
          }));
        });
      } else if (dec instanceof ParserConstantDeclare) {
        const name = file.module.child(dec.name);

        declarations.set(name, new CheckedAccessRecord({
          access: dec.access,
          name,
          module: file.module,
          type: qualifier.checkTypeExpression(dec.type),
        }));
      } else if (dec instanceof ParserFunctionDeclare) {
        const name = file.module.child(dec.name);

        declarations.set(name, new CheckedAccessRecord({
          access: dec.access,
          name,
          module: file.module,
          type: qualifier.checkFunctionDeclare(dec),
        }));

        dec.typeParams.forEach(param => {
          const paramName = name.child(param.name);

          declarations.set(paramName, new CheckedAccessRecord({
            access: 'public',
            name: paramName,
            module: file.module,
            type: new CheckedTypeParameterType({
              name: paramName,
            }),
          }));
        });
      } else if (dec instanceof ParserImplDeclare) {
        const base = qualifier.checkNominalType(dec.base instanceof ParserNominalType ? dec.base : dec.base.base).name;

        if (!file.module.isParent(base)) {
          // TODO: this is a temporary limitation that we'll need to find a way around
          dec.pos.fail(`Impl can only be declared within the same file as it's base type!`);
        }

        if (methods.has(base)) {
          // TODO: this is a temporary limitation that we'll need to find a way around
          dec.pos.fail('Cannot have duplicate declarations of impls for any base type!');
        }

        const baseMethods = Map<string, CheckedAccessRecord>().asMutable();

        for (const [key, parserFunc] of dec.methods) {
          const name = dec.symbol.child(parserFunc.name);

          const record = new CheckedAccessRecord({
            access: parserFunc.access,
            name,
            module: file.module,
            type: qualifier.checkFunctionDeclare(parserFunc),
          });

          declarations.set(name, record);

          parserFunc.typeParams.forEach(param => {
            const paramName = name.child(param.name);

            declarations.set(paramName, new CheckedAccessRecord({
              access: 'public',
              name: paramName,
              module: file.module,
              type: new CheckedTypeParameterType({
                name: paramName,
              }),
            }));
          });

          // only include instance methods. Static methods are still accessible from a pure static context
          if (isInstanceMethod(parserFunc)) {
            baseMethods.set(key, record);
          }
        }

        methods.set(base, baseMethods);
      }
    });
  });

  return { symbols: declarations.asImmutable(), methods: methods.asImmutable() };
}

export function collectDeclarations(file: ParserFile, manager: DependencyManager, preamble: Map<string, Symbol>): Map<string, Symbol> {
  const usableTypes = preamble.asMutable();

  // fill the scope with all types and values we find, both imported and declared locally
  file.declarations.forEach(dec => {
    if (dec instanceof ParserImportDeclaration) {
      manager.breakdownImport(dec).forEach(it => {
        usableTypes.set(it.name, it);
      });
    } else if (dec instanceof ParserFunctionDeclare) {
      usableTypes.set(dec.name, file.module.child(dec.name));
    } else if (dec instanceof ParserImplDeclare) {

    } else {
      usableTypes.set(dec.name, file.module.child(dec.name));
    }
  });

  return usableTypes.asImmutable();
}

export class Qualifier {

  readonly #dict: Map<string, Symbol>;
  readonly #typeParams: Map<string, Symbol>;

  constructor(dict: Map<string, Symbol>, typeParams: Map<string, Symbol> = Map()) {
    this.#dict = dict;
    this.#typeParams = typeParams;
  }

  includeTypeParams(parent: Symbol, typeParams: List<ParserTypeParameterType>): Qualifier {
    if (typeParams.isEmpty()) {
      return this;
    }

    return new Qualifier(this.#dict, typeParams.reduce((dict, next) => dict.set(next.name, parent.child(next.name)), Map()));
  }

  qualifyData(module: Symbol, dec: ParserDataDeclare): CheckedDataLayoutType {
    const name = module.child(dec.name);

    return this.#qualifyDataLayout(dec.layout, name, name);
  }

  #qualifyStructFields(fields: Map<string, ParserStructField>): Map<string, CheckedTypeExpression> {
    return fields.map(field => this.checkTypeExpression(field.type));
  }

  qualifyEnum(module: Symbol, dec: ParserEnumDeclare): CheckedEnumType {
    const name = module.child(dec.name);

    return new CheckedEnumType({
      pos: dec.pos,
      name,
      typeParams: dec.typeParams.map(it => this.checkTypeParamType(name, it)),
      variants: dec.variants.map((variant, key) => {
        return this.includeTypeParams(name, dec.typeParams).#qualifyDataLayout(variant, name.child(key), name);
      }),
    });
  }

  #qualifyDataLayout(ex: ParserDataLayout, name: Symbol, typeParamName: Symbol): CheckedDataLayoutType {
    if (ex instanceof ParserStruct) {
      return this.#qualifyStruct(ex, name, typeParamName);
    } else if (ex instanceof ParserTuple) {
      return this.#qualifyTuple(ex, name, typeParamName);
    } else {
      return this.#qualifyAtom(ex, name, typeParamName);
    }
  }

  #qualifyStruct(ex: ParserStruct, name: Symbol, typeParamName: Symbol): CheckedStructType {
    return new CheckedStructType({
      pos: ex.pos,
      name,
      typeParams: ex.typeParams.map(it => this.checkTypeParamType(typeParamName, it)),
      fields: this.#qualifyStructFields(ex.fields),
      enum: ex.enum,
    });
  }

  #qualifyTuple(ex: ParserTuple, name: Symbol, typeParamName: Symbol): CheckedTupleType {
    return new CheckedTupleType({
      pos: ex.pos,
      name,
      typeParams: ex.typeParams.map(it => this.checkTypeParamType(typeParamName, it)),
      fields: ex.fields.map(it => this.checkTypeExpression(it)),
      enum: ex.enum,
    });
  }

  #qualifyAtom(ex: ParserAtom, name: Symbol, typeParamName: Symbol): CheckedAtomType {
    return new CheckedAtomType({
      pos: ex.pos,
      name,
      typeParams: ex.typeParams.map(it => this.checkTypeParamType(typeParamName, it)),
      enum: ex.enum,
    })
  }

  checkTypeExpression(ex: ParserTypeExpression): CheckedTypeExpression {
    if (ex instanceof ParserNominalType) {
      return this.checkNominalType(ex);
    } else if (ex instanceof ParserParameterizedType) {
      return new CheckedParameterizedType({
        base: this.checkNominalType(ex.base),
        args: ex.args.map(it => this.checkTypeExpression(it)),
      });
    } else if (ex instanceof ParserFunctionType) {
      return this.checkFunctionType(ex);
    } else {
      return ex.pos.fail('No type checker for this expression');
    }
  }

  checkConcreteTypeExpression(ex: ParserConcreteType): CheckedConcreteType {
    if (ex instanceof ParserNominalType) {
      return this.checkNominalType(ex);
    } else {
      return new CheckedParameterizedType({
        base: this.checkNominalType(ex.base),
        args: ex.args.map(it => this.checkTypeExpression(it)),
      });
    }
  }

  checkNominalType(ex: ParserNominalType): CheckedNominalType {
    const name = ex.name.first()!.name;

    // TODO: when we have generic bounds, we'll need to be able to staticly pull methods off of them
    if (ex.name.size === 1) {
      const typeParamBase = this.#typeParams.get(name);

      if (typeParamBase !== undefined) {
        return new CheckedTypeParameterType({
          name: typeParamBase,
        })
      }
    }

    const base = this.#dict.get(name) ?? ex.pos.fail(`Could not find type with name ${ex.name.first()!.name} in scope`);

    return new CheckedNominalType({
      name: ex.name.toSeq().skip(1).reduce((prev, next) => prev.child(next.name), base),
    });
  }

  checkTypeParamType(base: Symbol, ex: ParserTypeParameterType): CheckedTypeParameterType {
    return new CheckedTypeParameterType({
      name: base.child(ex.name),
    });
  }

  checkFunctionType(ex: ParserFunctionType): CheckedFunctionType {
    return new CheckedFunctionType({
      phase: ex.phase,
      // this type is only used in places that are not allowed to define type params, so we don't need to deal with it
      typeParams: List(),
      params: ex.params.map(param => {
        return new CheckedFunctionTypeParameter({
          phase: param.phase,
          type: this.checkTypeExpression(param.type),
        });
      }),
      result: this.checkTypeExpression(ex.result),
    });
  }

  checkFunctionDeclare(dec: ParserFunctionDeclare): CheckedFunctionType {
    const childChecker = this.includeTypeParams(dec.symbol, dec.typeParams);

    return new CheckedFunctionType({
      phase: dec.functionPhase,
      typeParams: dec.typeParams.map(it => childChecker.checkTypeParamType(dec.symbol, it)),
      params: dec.params.map(it => {
        return new CheckedFunctionTypeParameter({
          phase: it.phase,
          type: childChecker.checkTypeExpression(it.type!),
        });
      }),
      result: childChecker.checkTypeExpression(dec.result),
    });
  }
}

export function isInstanceMethod(dec: CheckedFunctionDeclare | ParserFunctionDeclare): boolean {
  return dec.params.first()?.name === 'self';
}
