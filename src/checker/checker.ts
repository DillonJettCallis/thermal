import { DependencyManager, PackageName, Position, Symbol, } from "../ast.js";
import { List, Map, Seq, Set } from "immutable";
import { collectDeclarations, Qualifier } from "./collector.js";
import { CoreTypes } from "../lib.js";
import {
  CheckedAccessEx,
  CheckedAccessRecord,
  CheckedAndEx,
  CheckedAssignmentStatement,
  CheckedBlockEx,
  CheckedBooleanLiteralEx,
  CheckedCallEx,
  CheckedConstantDeclare,
  CheckedConstructEntry,
  CheckedConstructEx,
  CheckedEnumAtomVariant,
  CheckedEnumDeclare,
  CheckedEnumStructVariant,
  CheckedEnumTupleVariant,
  CheckedEnumType,
  CheckedEnumTypeAtomVariant,
  CheckedEnumTypeStructVariant,
  CheckedEnumTypeTupleVariant,
  CheckedEnumTypeVariant,
  CheckedExpression,
  CheckedExpressionStatement,
  CheckedFile,
  CheckedFloatLiteralEx,
  CheckedFunctionDeclare,
  CheckedFunctionStatement,
  CheckedFunctionType,
  CheckedFunctionTypeParameter,
  CheckedIdentifierEx,
  CheckedIfEx,
  CheckedImportDeclaration,
  CheckedIntLiteralEx,
  CheckedIsEx,
  CheckedLambdaEx,
  CheckedListLiteralEx,
  CheckedMapLiteralEntry,
  CheckedMapLiteralEx,
  CheckedModuleType,
  CheckedNominalType,
  CheckedNotEx,
  CheckedOrEx,
  CheckedOverloadFunctionType,
  CheckedParameter,
  CheckedParameterizedType,
  CheckedReassignmentStatement,
  CheckedReturnEx,
  CheckedSetLiteralEx,
  CheckedStatement,
  CheckedStaticAccessEx,
  CheckedStringLiteralEx,
  CheckedStructDeclare,
  CheckedStructField,
  CheckedStructType,
  CheckedTypeExpression,
  CheckedTypeParameterType
} from "./checkerAst.js";
import {
  ParserAccessEx,
  ParserAndEx,
  ParserAssignmentStatement,
  ParserBlockEx,
  ParserBooleanLiteralEx,
  ParserCallEx,
  ParserConstantDeclare,
  ParserConstructEx,
  ParserEnumStructVariant,
  ParserEnumTupleVariant,
  ParserExpression,
  ParserExpressionStatement,
  ParserFile,
  ParserFloatLiteralEx,
  ParserFunctionDeclare,
  ParserFunctionStatement,
  ParserIdentifierEx,
  ParserIfEx,
  ParserImportDeclaration,
  ParserIntLiteralEx,
  ParserIsEx,
  ParserLambdaEx,
  ParserListLiteralEx,
  ParserMapLiteralEx,
  ParserNotEx,
  ParserOrEx,
  ParserReassignmentStatement,
  ParserReturnEx,
  ParserSetLiteralEx,
  ParserStatement,
  ParserStaticAccessEx,
  ParserStringLiteralEx,
  ParserStructDeclare
} from "../parser/parserAst.js";

export class Checker {
  readonly #manager: DependencyManager;
  readonly #declarations: Map<PackageName, Map<Symbol, CheckedAccessRecord>>;
  readonly #coreTypes: CoreTypes;
  readonly #preamble: Map<string, Symbol>;

  constructor(manager: DependencyManager, declarations: Map<PackageName, Map<Symbol, CheckedAccessRecord>>, coreTypes: CoreTypes, preamble: Map<string, Symbol>) {
    this.#manager = manager;
    this.#declarations = declarations;
    this.#coreTypes = coreTypes;
    this.#preamble = preamble;
  }

  checkFile(file: ParserFile): CheckedFile {
    const declarations = collectDeclarations(file, this.#manager, this.#preamble);
    const filePos = new Position(file.src, 0, 0);
    const qualifier = new Qualifier(declarations);
    const fileScope = Scope.init(declarations.map(symbol => this.#typeSymbolToTypeExpression(symbol, filePos)), qualifier, file.module, this.#coreTypes.unit);

    const checkedDeclarations = file.declarations.map(dec => {
      if (dec instanceof ParserImportDeclaration) {
        return new CheckedImportDeclaration(dec);
      } else if (dec instanceof ParserFunctionDeclare) {
        const func = this.checkFunctionStatement(dec.func, fileScope, file.module);

        return new CheckedFunctionDeclare({
          pos: dec.pos,
          extern: dec.extern,
          access: dec.access,
          symbol: dec.symbol,
          func,
        })
      } else if (dec instanceof ParserConstantDeclare) {
        const type = fileScope.qualifier.checkTypeExpression(dec.type);
        const expression = this.#checkExpression(dec.expression, fileScope, type);

        if (!this.#checkAssignable(expression.type, type)) {
          return expression.pos.fail(`Incompatible types. Expected ${type} but found ${expression.type}`);
        }

        return new CheckedConstantDeclare({
          pos: dec.pos,
          name: dec.name,
          access: dec.access,
          symbol: dec.symbol,
          expression,
          type,
        })
      } else if (dec instanceof ParserStructDeclare) {
        const typeParams = dec.typeParams.map(it => fileScope.qualifier.checkTypeExpression(it) as CheckedTypeParameterType);
        const fields = dec.fields.map(it => {
          const type = fileScope.qualifier.checkTypeExpression(it.type);

          return new CheckedStructField({
            pos: it.pos,
            type,
            default: it.default === undefined ? undefined : this.#checkExpression(it.default, fileScope, type),
          });
        });

        return new CheckedStructDeclare({
          pos: dec.pos,
          name: dec.name,
          symbol: dec.symbol,
          access: dec.access,
          typeParams,
          fields,
        })
      } else {
        const typeParams = dec.typeParams.map(it => fileScope.qualifier.checkTypeExpression(it) as CheckedTypeParameterType);
        const variants = dec.variants.map(variant => {
          if (variant instanceof ParserEnumStructVariant) {
            const fields = variant.fields.map(it => {
              const type = fileScope.qualifier.checkTypeExpression(it.type);

              return new CheckedStructField({
                pos: it.pos,
                type,
                default: it.default === undefined ? undefined : this.#checkExpression(it.default, fileScope, type),
              });
            });

            return new CheckedEnumStructVariant({
              pos: variant.pos,
              symbol: variant.symbol,
              fields,
            });
          } else if (variant instanceof ParserEnumTupleVariant) {
            return new CheckedEnumTupleVariant({
              pos: variant.pos,
              symbol: variant.symbol,
              fields: variant.fields.map(it => fileScope.qualifier.checkTypeExpression(it)),
            });
          } else {
            return new CheckedEnumAtomVariant({
              pos: variant.pos,
              symbol: variant.symbol,
            });
          }
        });

        return new CheckedEnumDeclare({
          pos: dec.pos,
          name: dec.name,
          symbol: dec.symbol,
          access: dec.access,
          typeParams,
          variants,
        });
      }
    });

    return new CheckedFile({
      src: file.src,
      module: file.module,
      declarations: checkedDeclarations,
    });
  }

  #checkExpression(ex: ParserExpression, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedExpression {
    if (ex instanceof ParserBooleanLiteralEx) {
      return this.checkBooleanLiteral(ex);
    } else if (ex instanceof ParserIntLiteralEx) {
      return this.checkIntLiteral(ex);
    } else if (ex instanceof ParserFloatLiteralEx) {
      return this.checkFloatLiteral(ex);
    } else if (ex instanceof ParserStringLiteralEx) {
      return this.checkStringLiteral(ex);
    } else if (ex instanceof ParserIdentifierEx) {
      return this.checkIdentifier(ex, scope);
    } else if (ex instanceof ParserIsEx) {
      return this.checkIs(ex, scope);
    } else if (ex instanceof ParserAccessEx) {
      return this.checkAccess(ex, scope);
    } else if (ex instanceof ParserStaticAccessEx) {
      return this.checkStaticAccess(ex, scope);
    } else if (ex instanceof ParserConstructEx) {
      return this.checkConstruct(ex, scope, expected);
    } else if (ex instanceof ParserCallEx) {
      return this.checkCall(ex, scope);
    } else if (ex instanceof ParserAndEx) {
      return this.checkAnd(ex, scope);
    } else if (ex instanceof ParserOrEx) {
      return this.checkOr(ex, scope);
    } else if (ex instanceof ParserNotEx) {
      return this.checkNot(ex, scope);
    } else if (ex instanceof ParserIfEx) {
      return this.checkIf(ex, scope, expected);
    } else if (ex instanceof ParserLambdaEx) {
      return this.checkLambda(ex, scope, expected);
    } else if (ex instanceof ParserBlockEx) {
      return this.checkBlock(ex, scope, expected);
    } else if (ex instanceof ParserReturnEx) {
      return this.checkReturn(ex, scope);
    } else if (ex instanceof ParserListLiteralEx) {
      return this.checkListLiteral(ex, scope, expected);
    } else if (ex instanceof ParserSetLiteralEx) {
      return this.checkSetLiteral(ex, scope, expected);
    } else {
      return this.checkMapLiteral(ex, scope, expected);
    }
  }

  checkBooleanLiteral(ex: ParserBooleanLiteralEx): CheckedBooleanLiteralEx {
    return new CheckedBooleanLiteralEx({
      pos: ex.pos,
      value: ex.value,
      type: this.#coreTypes.boolean,
    });
  }

  checkIntLiteral(ex: ParserIntLiteralEx): CheckedIntLiteralEx {
    return new CheckedIntLiteralEx({
      pos: ex.pos,
      value: ex.value,
      type: this.#coreTypes.int,
    });
  }

  checkFloatLiteral(ex: ParserFloatLiteralEx): CheckedFloatLiteralEx {
    return new CheckedFloatLiteralEx({
      pos: ex.pos,
      value: ex.value,
      type: this.#coreTypes.float,
    });
  }

  checkStringLiteral(ex: ParserStringLiteralEx): CheckedStringLiteralEx {
    return new CheckedStringLiteralEx({
      pos: ex.pos,
      value: ex.value,
      type: this.#coreTypes.string,
    });
  }

  checkIdentifier(ex: ParserIdentifierEx, scope: Scope): CheckedIdentifierEx {
    return new CheckedIdentifierEx({
      pos: ex.pos,
      name: ex.name,
      type: scope.get(ex.name, ex.pos),
    });
  }

  checkIs(ex: ParserIsEx, scope: Scope): CheckedIsEx {
    return new CheckedIsEx({
      pos: ex.pos,
      not: ex.not,
      base: this.#checkExpression(ex.base, scope, undefined),
      check: scope.qualifier.checkTypeExpression(ex.check),
      type: this.#coreTypes.boolean,
    });
  }

  checkAccess(ex: ParserAccessEx, scope: Scope): CheckedAccessEx {
    const base = this.#checkExpression(ex.base, scope, undefined);
    const type = this.#processAccess(base.type, ex.field);

    return new CheckedAccessEx({
      pos: ex.pos,
      field: new CheckedIdentifierEx({
        pos: ex.field.pos,
        name: ex.field.name,
        type,
      }),
      base,
      type,
    });
  }

  checkStaticAccess(ex: ParserStaticAccessEx, scope: Scope): CheckedStaticAccessEx {
    const [first, ...rest] = ex.path.toArray();

    const init = this.checkIdentifier(first!!, scope);
    const path = List.of(init).asMutable();
    let prev = init.type;

    for (const next of rest) {
      if (prev instanceof CheckedModuleType) {
        const child = this.#declarations.get(prev.name.package)?.get(prev.name.child(next.name)) ?? next.pos.fail(`No such import found ${prev.name}`);
        path.push(new CheckedIdentifierEx({
          pos: next.pos,
          name: next.name,
          type: child.type,
        }));
        prev = child.type;
      } else if (prev instanceof CheckedEnumType) {
        const variant = prev.variants.get(next.name) ?? next.pos.fail(`No such enum variant found ${prev.name}`);
        path.push(new CheckedIdentifierEx({
          pos: next.pos,
          name: next.name,
          type: variant,
        }));
        prev = variant;
      } else {
        return next.pos.fail('No static members found');
      }
    }

    return new CheckedStaticAccessEx({
      pos: ex.pos,
      path: path.asImmutable(),
      type: prev,
    });
  }

  checkConstruct(ex: ParserConstructEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedConstructEx {
    const base = this.#checkExpression(ex.base, scope, undefined);
    const baseType = base.type;

    if (baseType instanceof CheckedStructType || baseType instanceof CheckedEnumTypeStructVariant) {
      // TODO: I forgot to handle default values inside of struct types
      // for now, let's just ignore defaults and we'll handle it some other time
      const expectedKeys = baseType.fields.keySeq().toSet();
      const actualKeys = Seq(ex.fields).map(it => it.name).toSet();
      // TODO: check for duplicated fields

      if (expectedKeys.equals(actualKeys)) {
        const expectedFields = expected instanceof CheckedStructType || expected instanceof CheckedEnumTypeStructVariant
          ? expected.fields
          : Map<string, CheckedTypeExpression>()
        ;

        // we can use any expected type information to resolve things like generics and lambdas
        const resolvedFields = List(ex.fields).toMap().mapKeys((_, it) => it.name).map(it => {
          return new CheckedConstructEntry({
            pos: it.pos,
            name: it.name,
            value: this.#checkExpression(it.value, scope, expectedFields.get(it.name)),
          });
        });

        // TODO: constructors can't explicitly declare generics, but they should be able to
        // now we need to confirm that the given expressions match the type we started with
        const genericParams = baseType instanceof CheckedStructType ? baseType.typeParams : this.#genericsOfEnum(baseType);
        const genericNames = genericParams.toSeq().map(it => it.name).toSet();
        const actualRawGenerics = resolvedFields.reduce((sum, actual) => {
          const expected = baseType.fields.get(actual.name)!!;

          return sum.concat(this.#applyGenerics(expected, actual.value.type, actual.value.pos, genericNames));
        }, List<{ symbol: Symbol, pos: Position, type: CheckedTypeExpression }>());

        const actualGenerics = actualRawGenerics.groupBy(it => it.symbol).map(list => {
          return list.reduce<CheckedTypeExpression>((left, right) => this.#mergeTypes(left, right.type, right.pos), this.#coreTypes.nothing);
        });

        // make sure that all generics have been filled
        const actualTypeArgs = genericParams.map(it => actualGenerics.get(it.name) ?? ex.pos.fail(`Unable to determine generic type ${it.name}`));

        // make sure that all types are actually assignable
        baseType.fields.forEach((expected, key) => {
          const expectedWithGenerics = this.#fillGenericTypes(expected, ex.pos, actualGenerics);
          const entry = resolvedFields.get(key)?.value ?? ex.pos.fail('This should not happen. A constructor is missing a required field after it was already checked');
          const actual = this.#fillGenericTypes(entry.type, ex.pos, actualGenerics);

          if (!this.#checkAssignable(actual, expectedWithGenerics)) {
            entry.pos.fail(`Type ${actual} is not assignable to expected type ${expectedWithGenerics}`);
          }
        });

        const baseName = new CheckedNominalType({name: baseType.name});

        const type = genericParams.isEmpty()
          ? baseName
          : new CheckedParameterizedType({ base: baseName, args: actualTypeArgs });

        return new CheckedConstructEx({
          pos: ex.pos,
          base,
          typeArgs: actualTypeArgs,
          fields: resolvedFields.valueSeq().toList(),
          type,
        });
      } else {
        // find out what we're missing or are extra
        const extra = actualKeys.subtract(expectedKeys);
        const missing = expectedKeys.subtract(actualKeys);

        const extraMessage = extra.isEmpty() ? '' : ` unknown fields ${extra}`;
        const missingMessage = missing.isEmpty() ? '' : ` missing fields ${missing}`;

        return ex.pos.fail(`Incompatible fields for constructor ${baseType.name} with ${extraMessage} ${missingMessage}`);
      }
    } else {
      return ex.pos.fail('Attempt to construct non-constructable')
    }
  }

  checkCall(ex: ParserCallEx, scope: Scope): CheckedCallEx {
    const func = this.#checkExpression(ex.func, scope, undefined);
    const funcType = func.type;

    if (funcType instanceof CheckedFunctionType) {
      // TODO: handle default arguments
      // TODO: handle generics in the expected type, that matters
      if (funcType.params.size === ex.args.size) {
        // we can use any expected type information to resolve things like generics and lambdas
        const resolvedFields = ex.args.map((it, index) => this.#checkExpression(it, scope, funcType.params.get(index)?.type));

        // now we need to confirm that the given expressions match the type we started with
        const genericParams = funcType.typeParams;
        const genericNames = genericParams.toSeq().map(it => it.name).toSet();
        const actualRawGenerics = resolvedFields.reduce((sum, actual, index) => {
          const expected = funcType.params.get(index)!!.type;

          return sum.concat(this.#applyGenerics(expected, actual.type, actual.pos, genericNames));
        }, List<{ symbol: Symbol, pos: Position, type: CheckedTypeExpression }>());

        const actualGenerics = actualRawGenerics.groupBy(it => it.symbol).map(list => {
          return list.reduce<CheckedTypeExpression>((left, right) => this.#mergeTypes(left, right.type, right.pos), this.#coreTypes.nothing);
        });

        // make sure that all generics have been filled
        const typeArgs = genericParams.map(it => actualGenerics.get(it.name) ?? ex.pos.fail(`Unable to determine generic type ${it.name}`));

        // make sure that all types are actually assignable
        funcType.params.forEach((expected, index) => {
          const expectedWithGenerics = this.#fillGenericTypes(expected.type, ex.pos, actualGenerics);
          const entry = resolvedFields.get(index) ?? ex.pos.fail('This should not happen. A function call is missing a required argument after it was already checked');
          const actual = this.#fillGenericTypes(entry.type, entry.pos, actualGenerics);

          if (!this.#checkAssignable(actual, expectedWithGenerics)) {
            entry.pos.fail(`Type ${actual} is not assignable to expected type ${expectedWithGenerics}`);
          }
        });

        return new CheckedCallEx({
          pos: ex.pos,
          func,
          args: resolvedFields,
          typeArgs,
          type: this.#fillGenericTypes(funcType.result, ex.pos, actualGenerics),
        });
      } else {
        return ex.pos.fail(`Function ${func.pos} expects ${funcType.params.size} arguments but found ${ex.args.size} arguments instead`);
      }
    } else if (funcType instanceof CheckedOverloadFunctionType) {
      // overloads are not allowed to have generics
      // this is a copy of the above code, done in a loop, with generic handling removed

      // we can use any expected type information to resolve things like generics and lambdas
      branchLoop: for (const branch of funcType.branches) {
        const funcType = branch;
        const resolvedFields = ex.args.map((it, index) => this.#checkExpression(it, scope, funcType.params.get(index)?.type));

        // make sure that all types are actually assignable
        for (let index = 0; index < funcType.params.size; index++) {
          const expected = funcType.params.get(index)!!;
          const expectedWithGenerics = expected.type;
          const actual = resolvedFields.get(index)?.type ?? ex.pos.fail('This should not happen. A function call is missing a required argument after it was already checked');

          if (!this.#checkAssignable(actual, expectedWithGenerics)) {
            // this branch is not valid. Break here and try the next branch
            continue branchLoop;
          }
        }

        return new CheckedCallEx({
          pos: ex.pos,
          func,
          args: resolvedFields,
          typeArgs: List(),
          type: funcType.result,
        });
      }

      // no branches worked, fail
      return ex.pos.fail('No overload found for arguments');
    } else if (funcType instanceof CheckedEnumTypeTupleVariant) {
      // this is a copy of the function checking code, slightly tweaked
      // TODO: handle default arguments
      // TODO: handle generics in the expected type, that matters
      if (funcType.fields.size === ex.args.size) {
        // we can use any expected type information to resolve things like generics and lambdas
        const resolvedFields = ex.args.map((it, index) => this.#checkExpression(it, scope, funcType.fields.get(index)));

        // now we need to confirm that the given expressions match the type we started with
        const genericParams = this.#genericsOfEnum(funcType);
        const genericNames = genericParams.toSeq().map(it => it.name).toSet();
        const actualRawGenerics = resolvedFields.reduce((sum, actual, index) => {
          const expected = funcType.fields.get(index)!!;

          return sum.concat(this.#applyGenerics(expected, actual.type, actual.pos, genericNames));
        }, List<{ symbol: Symbol, pos: Position, type: CheckedTypeExpression }>());

        const actualGenerics = actualRawGenerics.groupBy(it => it.symbol).map(list => {
          return list.reduce<CheckedTypeExpression>((left, right) => this.#mergeTypes(left, right.type, right.pos), this.#coreTypes.nothing);
        });

        // make sure that all generics have been filled
        const typeArgs = genericParams.map(it => actualGenerics.get(it.name) ?? ex.pos.fail(`Unable to determine generic type ${it.name}`));

        // make sure that all types are actually assignable
        funcType.fields.forEach((expected, index) => {
          const expectedWithGenerics = this.#fillGenericTypes(expected, ex.pos, actualGenerics);
          const entry = resolvedFields.get(index) ?? ex.pos.fail('This should not happen. A tuple constructor call is missing a required argument after it was already checked');
          const actual = this.#fillGenericTypes(entry.type, entry.pos, actualGenerics);

          if (!this.#checkAssignable(actual, expectedWithGenerics)) {
            entry.pos.fail(`Type ${actual} is not assignable to expected type ${expectedWithGenerics}`);
          }
        });

        return new CheckedCallEx({
          pos: ex.pos,
          func,
          args: resolvedFields,
          typeArgs,
          type: this.#fillGenericTypes(funcType, ex.pos, actualGenerics),
        });
      } else {
        return ex.pos.fail(`Tuple ${func.pos} expects ${funcType.fields.size} arguments but found ${ex.args.size} arguments instead`);
      }
    } else {
      return ex.pos.fail('Attempt to call non-callable')
    }
  }

  checkAnd(ex: ParserAndEx, scope: Scope): CheckedAndEx {
    const left = this.#checkExpression(ex.left, scope, this.#coreTypes.boolean);
    const right = this.#checkExpression(ex.right, scope, this.#coreTypes.boolean);

    if (!left.type.equals(this.#coreTypes.boolean)) {
      left.pos.fail(`Left side of '&&' should be a boolean but is actually '${left.type}'`);
    }

    if (!right.type.equals(this.#coreTypes.boolean)) {
      right.pos.fail(`Right side of '&&' should be a boolean but is actually '${right.type}'`);
    }

    return new CheckedAndEx({
      pos: ex.pos,
      left,
      right,
      type: this.#coreTypes.boolean,
    });
  }

  checkOr(ex: ParserOrEx, scope: Scope): CheckedOrEx {
    const left = this.#checkExpression(ex.left, scope, this.#coreTypes.boolean);
    const right = this.#checkExpression(ex.right, scope, this.#coreTypes.boolean);

    if (!left.type.equals(this.#coreTypes.boolean)) {
      left.pos.fail(`Left side of '||' should be a boolean but is actually '${left.type}'`);
    }

    if (!right.type.equals(this.#coreTypes.boolean)) {
      right.pos.fail(`Right side of '||' should be a boolean but is actually '${right.type}'`);
    }

    return new CheckedOrEx({
      pos: ex.pos,
      left,
      right,
      type: this.#coreTypes.boolean,
    });
  }

  checkNot(ex: ParserNotEx, scope: Scope): CheckedNotEx {
    const base = this.#checkExpression(ex.base, scope, this.#coreTypes.boolean);

    if (!base.type.equals(this.#coreTypes.boolean)) {
      base.pos.fail(`Base of side of '!' should be a boolean but is actually '${base.type}'`);
    }

    return new CheckedNotEx({
      pos: ex.pos,
      base,
      type: this.#coreTypes.boolean,
    });
  }

  checkIf(ex: ParserIfEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedIfEx {
    const condition = this.#checkExpression(ex.condition, scope, this.#coreTypes.boolean);
    const thenEx = this.#checkExpression(ex.thenEx, scope, expected);
    const elseEx = ex.elseEx === undefined ? undefined : this.#checkExpression(ex.elseEx, scope, expected);

    if (!condition.type.equals(this.#coreTypes.boolean)) {
      condition.pos.fail(`Condition of 'if' should be a boolean but is actually '${condition.type}'`);
    }

    return new CheckedIfEx({
      pos: ex.pos,
      condition,
      thenEx,
      elseEx,
      type: elseEx === undefined ? this.#coreTypes.optionOf(thenEx.type) : this.#mergeTypes(thenEx.type, elseEx.type, ex.pos),
    });
  }

  checkLambda(ex: ParserLambdaEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedLambdaEx {
      let params: List<CheckedParameter>;
      let expectedResult: CheckedTypeExpression | undefined = undefined;

      if (expected instanceof CheckedFunctionType) {
        if (ex.params.size !== expected.params.size) {
          ex.pos.fail(`Wrong number of arguments, expected function with arguments '${expected.params}' but found ${ex.params.size} arguments`)
        }

        // we can spot check the expected types whenever we don't have them (and only when we need to check)

        expectedResult = expected.result;
        params = ex.params.map((it, index) => {
          const type = it.type === undefined
            ? expected.params.get(index)!!.type // no type specified, look it up from expected
            : scope.qualifier.checkTypeExpression(it.type);

          return new CheckedParameter({
            pos: it.pos,
            phase: it.phase,
            name: it.name,
            type,
          });
        })
      } else {
        // our lambda had better explicitly declare all of its args or we throw up
        params = ex.params.map(it => {
          if (it.type === undefined) {
            return it.pos.fail('Unable to determine type from context!');
          }

          const type = scope.qualifier.checkTypeExpression(it.type);

          return new CheckedParameter({
            pos: it.pos,
            phase: it.phase,
            name: it.name,
            type,
          });
        })
      }

      // TODO: I'm not sure if 'Nothing' is actually going to work here, make sure to test that
      // TODO: create a system to give annon lambdas names
      const childScope = scope.childFunction(scope.functionScope.symbol.child('<lambda>'), expectedResult ?? this.#coreTypes.nothing);

      for (const param of params) {
        childScope.set(param.name, param.type);
      }

      const body = this.#checkExpression(ex.body, childScope, expectedResult);

      return new CheckedLambdaEx({
        pos: ex.pos,
        phase: ex.phase,
        params,
        body,
        type: new CheckedFunctionType({
          phase: ex.phase,
          typeParams: List(),
          params: params.map(it => {
            return new CheckedFunctionTypeParameter({
              phase: it.phase,
              type: it.type,
            });
          }),
          result: this.#mergeTypes(body.type, childScope.functionScope.resultType, ex.pos),
        }),
      });
  }

  checkBlock(ex: ParserBlockEx, parentScope: Scope, expected: CheckedTypeExpression | undefined): CheckedBlockEx {
    if (ex.body.isEmpty()) {
      return new CheckedBlockEx({
        pos: ex.pos,
        body: List(),
        type: this.#coreTypes.unit,
      });
    }

    const scope = parentScope.child();

    // all but the last statement
    const initBody: List<CheckedStatement> = ex.body.shift().map(state => this.checkStatement(state, scope, undefined));
    // the last statement is the only one that gets expected, and the only one who's type matters
    const last = this.checkStatement(ex.body.last()!!, scope, expected);
    const body = initBody.push(last);

    return new CheckedBlockEx({
      pos: ex.pos,
      body,
      type: last.type,
    });
  }

  checkStatement(state: ParserStatement, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedStatement {
    if (state instanceof ParserAssignmentStatement) {
      return this.checkAssignmentStatement(state, scope);
    } else if (state instanceof ParserReassignmentStatement) {
      return this.checkReassignmentStatement(state, scope);
    } else if (state instanceof ParserExpressionStatement) {
      return this.checkExpressionStatement(state, scope, expected);
    } else {
      return this.checkFunctionStatement(state, scope, scope.functionScope.symbol);
    }
  }

  checkAssignmentStatement(state: ParserAssignmentStatement, scope: Scope): CheckedAssignmentStatement {
    const expectedType = state.type === undefined ? undefined : scope.qualifier.checkTypeExpression(state.type);
    const expression = this.#checkExpression(state.expression, scope, expectedType);

    if (expectedType !== undefined && !this.#checkAssignable(expression.type, expectedType)) {
      state.expression.pos.fail(`Expected type '${expectedType}' but found type '${expression.type}'`);
    }

    const type = expectedType ?? expression.type;

    scope.set(state.name, type);

    return new CheckedAssignmentStatement({
      pos: state.pos,
      phase: state.phase,
      name: state.name,
      expression,
      type: this.#coreTypes.unit,
    });
  }

  checkReassignmentStatement(state: ParserReassignmentStatement, scope: Scope): CheckedReassignmentStatement {
    const type = scope.get(state.name, state.pos);

    const expression = this.#checkExpression(state.expression, scope, type);

    if (!this.#checkAssignable(expression.type, type)) {
      state.pos.fail(`Expected assignment of type '${type}' but found value of type '${expression.type}'`);
    }

    return new CheckedReassignmentStatement({
      pos: state.pos,
      name: state.name,
      expression,
      type: this.#coreTypes.unit,
    });
  }

  checkExpressionStatement(state: ParserExpressionStatement, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedExpressionStatement {
    const expression = this.#checkExpression(state.expression, scope, expected);

    return new CheckedExpressionStatement({
      pos: state.pos,
      expression,
      type: expression.type,
    });
  }

  checkFunctionStatement(state: ParserFunctionStatement, scope: Scope, parent: Symbol): CheckedFunctionStatement {
    // TODO: use the lambda expression checker internally to cut down on duplicated logic
    const symbol = parent.child(state.name);
    const params = state.lambda.params.map(it => {
      if (it.type === undefined) {
        return it.pos.fail('Unable to determine type from context!');
      }

      const type = scope.qualifier.checkTypeExpression(it.type);

      return new CheckedParameter({
        pos: it.pos,
        phase: it.phase,
        name: it.name,
        type,
      });
    });

    const result = scope.qualifier.checkTypeExpression(state.result);

    const childScope = scope.childFunction(symbol, result);

    const typeParams = state.typeParams.map(typeParam => {
      return new CheckedTypeParameterType({
        name: symbol.child(typeParam.name),
      });
    });

    for (const typeParam of typeParams) {
      childScope.set(typeParam.name.name, typeParam);
    }

    for (const param of params) {
      childScope.set(param.name, param.type);
    }

    const body = this.#checkExpression(state.lambda.body, childScope, result);
    const type = new CheckedFunctionType({
      phase: state.lambda.phase,
      typeParams,
      params: params.map(it => {
        return new CheckedFunctionTypeParameter({
          phase: it.phase,
          type: it.type,
        });
      }),
      result,
    });

    scope.set(state.name, type);

    return new CheckedFunctionStatement({
      pos: state.pos,
      lambda: new CheckedLambdaEx({
        pos: state.pos,
        phase: state.lambda.phase,
        params,
        body,
        type,
      }),
      name: state.name,
      typeParams,
      result,
      type,
    });
  }

  checkReturn(ex: ParserReturnEx, scope: Scope): CheckedReturnEx {
    const base = this.#checkExpression(ex.base, scope, scope.functionScope.resultType);

    // check that expression is valid with scope result type, update scope result type if needed
    scope.functionScope.resultType = this.#mergeTypes(base.type, scope.functionScope.resultType, ex.pos);

    return new CheckedReturnEx({
      pos: ex.pos,
      base,
      type: this.#coreTypes.nothing, // return always evaluates to nothing
    });
  }

  checkListLiteral(ex: ParserListLiteralEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedListLiteralEx {
    const expectedItem = expected instanceof CheckedParameterizedType && expected.base.equals(this.#coreTypes.list) ? expected.args.first() : undefined;

    const values = ex.values.map(item => this.#checkExpression(item, scope, expectedItem));
    const type = this.#mergeList(values.map(it => it.type), expectedItem ?? this.#coreTypes.nothing, ex.pos);

    return new CheckedListLiteralEx({
      pos: ex.pos,
      values,
      type: this.#coreTypes.listOf(type),
    });
  }

  checkSetLiteral(ex: ParserSetLiteralEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedSetLiteralEx {
    const expectedItem = expected instanceof CheckedParameterizedType && expected.base.equals(this.#coreTypes.set) ? expected.args.first() : undefined;

    const values = ex.values.map(item => this.#checkExpression(item, scope, expectedItem));
    const type = this.#mergeList(values.map(it => it.type), expectedItem ?? this.#coreTypes.nothing, ex.pos);

    return new CheckedListLiteralEx({
      pos: ex.pos,
      values,
      type: this.#coreTypes.listOf(type),
    });
  }

  checkMapLiteral(ex: ParserMapLiteralEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedMapLiteralEx {
    const [expectedKey, expectedValue] = expected instanceof CheckedParameterizedType && expected.base.equals(this.#coreTypes.set)
      ? [expected.args.get(0), expected.args.get(1)]
      : [undefined, undefined];

    const entries = ex.values.map(item => {
      return new CheckedMapLiteralEntry({
        pos: item.pos,
        key: this.#checkExpression(item.key, scope, expectedKey),
        value: this.#checkExpression(item.value, scope, expectedValue)
      });
    });
    const keyType = this.#mergeList(entries.map(it => it.key.type), expectedKey ?? this.#coreTypes.nothing, ex.pos);
    const valueType = this.#mergeList(entries.map(it => it.value.type), expectedValue ?? this.#coreTypes.nothing, ex.pos);

    return new CheckedMapLiteralEx({
      pos: ex.pos,
      values: entries,
      type: this.#coreTypes.mapOf(keyType, valueType),
    });
  }

  #genericsOfEnum(ex: CheckedEnumTypeVariant): List<CheckedTypeParameterType> {
    const base = this.#declarations.get(ex.name.package)?.get(ex.name.parent()!!);

    if (base?.type instanceof CheckedEnumType) {
      return base.type.typeParams;
    } else {
      return ex.pos.fail("Expected enum type but didn't find it.");
    }
  }

  #applyGenerics(expected: CheckedTypeExpression, actual: CheckedTypeExpression, pos: Position, expectedGenerics: Set<Symbol>): List<{ symbol:  Symbol, pos: Position, type: CheckedTypeExpression}> {
    const generics = List<{ symbol:  Symbol, pos: Position, type: CheckedTypeExpression}>().asMutable();

    function inner(expected: CheckedTypeExpression | undefined, actual: CheckedTypeExpression | undefined): void {
      if (expected === undefined || actual === undefined) {
        return;
      } else if (expected instanceof CheckedTypeParameterType) {
        if (expectedGenerics.has(expected.name)) {
          generics.push({symbol: expected.name, pos, type: actual});
        }
      } else if (expected instanceof CheckedParameterizedType) {
        if (actual instanceof CheckedParameterizedType) {
          expected.args.zip<CheckedTypeExpression>(actual.args).forEach(([ex, act]) => inner(ex, act));
        }
      } else if (expected instanceof CheckedFunctionType) {
        if (actual instanceof CheckedFunctionType) {
          expected.params.zip<CheckedTypeExpression>(actual.params).forEach(([ex, act]) => inner(ex, act));
          inner(expected.result, actual.result);
        }
      }
    }

    inner(expected, actual);

    return generics.asImmutable();
  }

  #checkAllAssignable(actual: List<CheckedTypeExpression>, expected: List<CheckedTypeExpression>): boolean {
    return actual.size === expected.size && actual.zip<CheckedTypeExpression>(expected).every(([left, right]) => this.#checkAssignable(left, right));
  }

  #checkAssignable(actual: CheckedTypeExpression, expected: CheckedTypeExpression | undefined): boolean {
    if (expected === undefined) {
      return true;
    }

    // if they exactly match, then we're good
    if (actual.equals(expected)) {
      return true;
    }

    // special case: 'Nothing' can be assigned to anything
    if (actual.equals(this.#coreTypes.nothing)) {
      return true;
    }

    // TODO: when we implement bounds, they'll need to go here
    if (actual instanceof CheckedTypeParameterType || expected instanceof CheckedTypeParameterType ) {
      return true;
    }

    if (actual instanceof CheckedFunctionType && expected instanceof CheckedFunctionType) {
      return this.#checkAssignableFunctionTypes(actual, expected);
    }

    if (expected instanceof CheckedEnumType) {
      if (actual instanceof CheckedEnumTypeStructVariant || actual instanceof CheckedEnumTypeTupleVariant || actual instanceof CheckedEnumTypeAtomVariant) {
        const parent = actual.name.parent();

        if (parent === undefined) {
          // this null check situation really should never happen
          return false;
        } else {
          // if the enum variant is a sub-type of this enum
          return parent.equals(expected.name);
        }
      }

      return false;
    }

    // no matching case
    return false;
  }

  #mergeList(items: List<CheckedTypeExpression>, init: CheckedTypeExpression, pos: Position): CheckedTypeExpression {
    return items.reduce((sum, next) => this.#mergeTypes(sum, next, pos), init);
  }

  /**
   * Merge these two types. This is used in places like generic functions and collection literals.
   *
   * For example: `[1, 2.3]` contains an int and a float. The final list should correctly count as `float`
   * The other use case is for enum variants
   * TODO: if we have any other polymorphism (aka: type classes), that will have to be handled here too
   */
  #mergeTypes(left: CheckedTypeExpression, right: CheckedTypeExpression, pos: Position): CheckedTypeExpression {
    if (left.equals(right)) {
      return left;
    }

    if (left.equals(this.#coreTypes.nothing)) {
      return right;
    } else if (right.equals(this.#coreTypes.nothing)) {
      return left;
    } else if (this.#checkAssignable(left, right)) {
      return right;
    } else if (this.#checkAssignable(right, left)) {
      return left;
    } else {
      return pos.fail(`Incompatible with other type`)
    }
  }

  #checkAssignableFunctionTypes(actual: CheckedFunctionType, expected: CheckedFunctionType): boolean {
    // results are checked backwards because of contravariance
    return actual.phase === expected.phase && this.#checkAssignable(expected.result, actual.result) && actual.params.size === expected.params.size &&
      // TODO: consider how to compare phases. For now demand they are exactly equal
      actual.params.zip<CheckedFunctionTypeParameter>(expected.params).every(([left, right]) => (left.phase ?? 'val') === (right.phase ?? 'val') && this.#checkAssignable(left.type!!, right.type));
  }

  #typeSymbolToTypeExpression(symbol: Symbol, pos: Position): CheckedTypeExpression {
    const pack = this.#declarations.get(symbol.package);

    if (pack === undefined) {
      return pos.fail(`Failed to find '${symbol}'`);
    }

    const record = pack.get(symbol);

    if (record === undefined) {
      return pos.fail(`Failed to find '${symbol}'`);
    }

    // TODO: do we need to check access here? In theory it's already been checked ..
    return record.type;
  }

  #processAccess(type: CheckedTypeExpression, id: ParserIdentifierEx): CheckedTypeExpression {
    if (type instanceof CheckedStructType || type instanceof CheckedEnumTypeStructVariant) {
      return type.fields.get(id.name) ?? id.pos.fail(`Not able to find field ${id.name} on type ${type.name}`);
    } else if (type instanceof CheckedEnumTypeTupleVariant) {
      if (id.name.startsWith('v')) {
        const num = Number.parseInt(id.name.substring(1));

        if (Number.isSafeInteger(num) && num < type.fields.size) {
          return type.fields.get(num)!!;
        }
      }

      return id.pos.fail('Invalid field of tuple value');
    } else if (type instanceof CheckedEnumTypeAtomVariant) {
      return id.pos.fail('Atom type has no fields');
    } else if (type instanceof CheckedModuleType) {
      return id.pos.fail('Module type has no fields');
    } else if (type instanceof CheckedFunctionType || type instanceof CheckedOverloadFunctionType) {
      return id.pos.fail('Function type has no fields');
    } else if (type instanceof CheckedFunctionTypeParameter) {
      return id.pos.fail('Something is wrong, it should be impossible to access this');
    } else if (type instanceof CheckedEnumType) {
      return id.pos.fail('Enum type has no fields');
    } else if (type instanceof CheckedTypeParameterType) {
      // TODO: someday we'll have bounds, and when we do this will need to be changed to allow field access to valid bounds
      return id.pos.fail('Unknown type has no fields');
    } else if (type instanceof CheckedNominalType) {
      const realType = this.#declarations.get(type.name.package)?.get(type.name)?.type;

      if (realType === undefined) {
        // this should not happen, since the verifier should have detected this
        return id.pos.fail('Unable to find type information');
      }

      return this.#processAccess(realType, id);
    } else {
      const realType = this.#declarations.get(type.base.name.package)?.get(type.base.name)?.type;

      if (realType === undefined) {
        // this should not happen, since the verifier should have detected this
        return id.pos.fail('Unable to find type information');
      }

      if (realType instanceof CheckedStructType) {
        // only a struct both has type params and fields, at least right now

        if (realType.typeParams.size !== type.args.size) {
          return id.pos.fail(`Incorrect number of type params. Expected ${realType.typeParams.size} but found ${type.args.size}`);
        }

        const generics = Map(realType.typeParams.map(it => it.name).zip<CheckedTypeExpression>(type.args));
        const field = realType.fields.get(id.name) ?? id.pos.fail(`Not able to find field ${id.name} on type ${realType.name}`);

        return this.#fillGenericTypes(field, id.pos, generics);
      } else {
        return id.pos.fail("Parameterized type has no fields");
      }
    }
  }

  /**
   * This function's job is to take a signature of a generic field or function and fill in the known generic types
   *
   * Example of a field would work like this:
   *
   * ```
   * struct Thing<A> {
   *  field: A,
   * }
   *
   * fun test(input: Thing<Int>): Int {
   *  return input.field; // this expression is where this method would be called
   * }
   * ```
   *
   * The `ex` here would be the field return type, which would be of kind 'typeExpression' and named 'Thing::A'.
   *
   * The `generics` map would contain just one entry, `Thing::A to Int` because we're looking at a Thing<A> and
   * at this use case it's known that `A` is `Int`.
   *
   * This method should then return just `Int`.
   */
  #fillGenericTypes(ex: CheckedTypeExpression, pos: Position, generics: Map<Symbol, CheckedTypeExpression>): CheckedTypeExpression {
    const self = this;

    function fill(ex: CheckedTypeExpression): CheckedTypeExpression {
      if (ex instanceof CheckedStructType) {
        return ex.set('fields', ex.fields.map(fill));
      } else if (ex instanceof CheckedEnumTypeStructVariant) {
        return ex.set('fields', ex.fields.map(fill));
      } else if (ex instanceof CheckedEnumTypeTupleVariant) {
        return ex.set('fields', ex.fields.map(fill));
      } else if (ex instanceof CheckedEnumTypeAtomVariant) {
        return ex;
      } else if (ex instanceof CheckedModuleType) {
        return ex;
      } else if (ex instanceof CheckedEnumType) {
        return ex.set('variants', ex.variants.map(fill) as Map<string, CheckedEnumTypeVariant>);
      } else if (ex instanceof CheckedFunctionType) {
        return ex.set('params', ex.params.map(it => it.set('type', fill(it.type)))).set('result', fill(ex.result));
      } else if (ex instanceof CheckedFunctionTypeParameter) {
        return ex.set('type', fill(ex.type));
      } else if (ex instanceof CheckedOverloadFunctionType) {
        // overload functions are not allowed to be generic
        return ex;
      } else if (ex instanceof CheckedParameterizedType) {
        return ex.set('args', ex.args.map(fill));
      } else if (ex instanceof CheckedNominalType) {
        const realType = self.#declarations.get(ex.name.package)?.get(ex.name)?.type;

        if (realType === undefined) {
          // this should not happen, since the verifier should have detected this
          return pos.fail('Unable to find type information');
        }

        return ex;
      } else {
        // the magic happens here
        return generics.get(ex.name) ?? pos.fail(`Unable to find generic type parameter with name ${ex.name}`);
      }
    }

    return fill(ex);
  }

}

class FunctionScope {

  constructor(readonly symbol: Symbol, public resultType: CheckedTypeExpression) {
  }

}

export class Scope {
  readonly #parent: Scope | undefined;
  readonly #symbols: Map<string, CheckedTypeExpression>;
  readonly qualifier: Qualifier;
  readonly functionScope: FunctionScope;

  private constructor(parent: Scope | undefined, declared: Map<string, CheckedTypeExpression> | undefined, qualifier: Qualifier, functionScope: FunctionScope) {
    this.#parent = parent;
    this.#symbols = (declared ?? Map<string, CheckedTypeExpression>()).asMutable();
    this.qualifier = qualifier;
    this.functionScope = functionScope;
  }

  static init(declared: Map<string, CheckedTypeExpression>, qualifier: Qualifier, symbol: Symbol, resultType: CheckedTypeExpression): Scope {
    return new Scope(undefined, declared, qualifier, new FunctionScope(symbol, resultType));
  }

  child(): Scope {
    return new Scope(this, undefined, this.qualifier, this.functionScope);
  }

  childFunction(symbol: Symbol, resultType: CheckedTypeExpression): Scope {
    return new Scope(this, undefined, this.qualifier, new FunctionScope(symbol, resultType));
  }

  get(name: string, pos: Position): CheckedTypeExpression {
    const maybe = this.#symbols.get(name);

    if (maybe !== undefined) {
      return maybe;
    }

    if (this.#parent !== undefined) {
      return this.#parent.get(name, pos);
    }

    return pos.fail(`Could not find '${name}' in scope`);
  }

  set(name: string, type: CheckedTypeExpression): void {
    this.#symbols.set(name, type);
  }
}
