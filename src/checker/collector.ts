import { List, Map } from 'immutable';
import type { DependencyManager, Symbol } from '../ast.ts';
import {
  ParserAtom,
  ParserConstantDeclare,
  ParserDataDeclare,
  type ParserDataLayout,
  ParserEnumDeclare,
  type ParserFile,
  ParserFunctionDeclare,
  ParserFunctionType,
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
  type CheckedDataLayoutType,
  CheckedEnumType,
  CheckedFunctionType,
  CheckedFunctionTypeParameter,
  CheckedNominalType,
  CheckedParameterizedType,
  CheckedStructType,
  CheckedTupleType,
  type CheckedTypeExpression,
  CheckedTypeParameterType,
} from './checkerAst.ts';


/**
 * Given this file of parsed things, return a map of all symbols with their access level and type
 */
export function collectSymbols(files: Array<ParserFile>, manager: DependencyManager, preamble: Map<string, Symbol>): Map<Symbol, CheckedAccessRecord> {
  const declarations = Map<Symbol, CheckedAccessRecord>().asMutable();

  files.forEach(file => {
    const module = file.module;
    const qualifier = new Qualifier(collectDeclarations(file, manager, preamble));

    // now qualify all types with these other found types, so that we can export that information outside
    file.declarations.forEach(dec => {
      if (dec instanceof ParserImportDeclaration) {
        // imports are never exported
      } else if (dec instanceof ParserDataDeclare) {
        const checked = qualifier.qualifyData(file.module, dec);
        declarations.set(checked.name, new CheckedAccessRecord({
          access: dec.access,
          module,
          type: checked,
        }));

        checked.typeParams.forEach(param => {
          declarations.set(param.name, new CheckedAccessRecord({
            access: 'public',
            module,
            type: param,
          }));
        });
      } else if (dec instanceof ParserEnumDeclare) {
        const checked = qualifier.qualifyEnum(file.module, dec);
        declarations.set(checked.name, new CheckedAccessRecord({
          access: dec.access,
          module,
          type: checked,
        }));

        checked.typeParams.forEach(param => {
          declarations.set(param.name, new CheckedAccessRecord({
            access: 'public',
            module,
            type: param,
          }));
        });

        checked.variants.valueSeq().forEach(varient => {
          declarations.set(varient.name, new CheckedAccessRecord({
            access: dec.access,
            module,
            type: varient,
          }));
        });
      } else if (dec instanceof ParserConstantDeclare) {
        declarations.set(file.module.child(dec.name), new CheckedAccessRecord({
          access: dec.access,
          module,
          type: qualifier.checkTypeExpression(dec.type),
        }));
      } else if (dec instanceof ParserFunctionDeclare) {
        const name = file.module.child(dec.func.name);

        declarations.set(name, new CheckedAccessRecord({
          access: dec.access,
          module,
          type: new CheckedFunctionType({
            phase: dec.func.lambda.functionPhase,
            typeParams: dec.func.typeParams.map(it => qualifier.checkTypeParamType(it)),
            params: dec.func.lambda.params.map(it => {
              return new CheckedFunctionTypeParameter({
                phase: it.phase,
                type: qualifier.checkTypeExpression(it.type!),
              });
            }),
            result: qualifier.checkTypeExpression(dec.func.result),
          }),
        }));

        dec.func.typeParams.forEach(param => {
          const paramName = name.child(param.name);

          declarations.set(paramName, new CheckedAccessRecord({
            access: 'public',
            module,
            type: new CheckedTypeParameterType({
              name: paramName,
            }),
          }));
        });
      }
    });
  });

  return declarations.asImmutable();
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
      usableTypes.set(dec.func.name, file.module.child(dec.func.name));
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

  qualifyData(module: Symbol, dec: ParserDataDeclare): CheckedDataLayoutType {
    const name = module.child(dec.name);

    return this.#qualifyDataLayout(dec.layout, name);
  }

  #qualifyStructFields(fields: Map<string, ParserStructField>): Map<string, CheckedTypeExpression> {
    return fields.map(field => this.checkTypeExpression(field.type));
  }

  qualifyEnum(module: Symbol, dec: ParserEnumDeclare): CheckedEnumType {
    const name = module.child(dec.name);

    return new CheckedEnumType({
      pos: dec.pos,
      name,
      typeParams: dec.typeParams.map(it => this.checkTypeParamType(it)),
      variants: dec.variants.map((variant, key) => {
        return this.#qualifyDataLayout(variant, name.child(key));
      }),
    });
  }

  #qualifyDataLayout(ex: ParserDataLayout, name: Symbol): CheckedDataLayoutType {
    if (ex instanceof ParserStruct) {
      return this.#qualifyStruct(ex, name);
    } else if (ex instanceof ParserTuple) {
      return this.#qualifyTuple(ex, name);
    } else {
      return this.#qualifyAtom(ex, name);
    }
  }

  #qualifyStruct(ex: ParserStruct, name: Symbol): CheckedStructType {
    return new CheckedStructType({
      pos: ex.pos,
      name,
      typeParams: ex.typeParams.map(it => this.checkTypeParamType(it)),
      fields: this.#qualifyStructFields(ex.fields),
      enum: ex.enum,
    });
  }

  #qualifyTuple(ex: ParserTuple,  name: Symbol): CheckedTupleType {
    return new CheckedTupleType({
      pos: ex.pos,
      name,
      typeParams: ex.typeParams.map(it => this.checkTypeParamType(it)),
      fields: ex.fields.map(it => this.checkTypeExpression(it)),
      enum: ex.enum,
    });
  }

  #qualifyAtom(ex: ParserAtom, name: Symbol): CheckedAtomType {
    return new CheckedAtomType({
      pos: ex.pos,
      name,
      typeParams: ex.typeParams.map(it => this.checkTypeParamType(it)),
      enum: ex.enum,
    })
  }

  checkTypeExpression(ex: ParserTypeExpression): CheckedTypeExpression {
    if (ex instanceof ParserNominalType) {
      return this.checkNominalType(ex);
    } else if (ex instanceof ParserTypeParameterType) {
      return this.checkTypeParamType(ex);
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

  checkNominalType(ex: ParserNominalType): CheckedNominalType {
    const base = this.#dict.get(ex.name.first()!.name) ?? ex.pos.fail(`Could not find type with name ${ex.name.first()!.name} in scope`);

    return new CheckedNominalType({
      name: ex.name.toSeq().skip(1).reduce((prev, next) => prev.child(next.name), base),
    });
  }

  checkTypeParamType(ex: ParserTypeParameterType): CheckedTypeParameterType {
    const base = this.#dict.get(ex.name) ?? ex.pos.fail(`Could not find type with name ${ex.name} in scope`);

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
}

