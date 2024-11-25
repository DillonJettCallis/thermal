import type { DependencyManager, ExpressionPhase, FunctionPhase, PackageName, Symbol } from '../ast.ts';
import { Position } from '../ast.ts';
import type { Set } from 'immutable';
import { List, Map, Record, Seq } from 'immutable';
import { collectDeclarations, Qualifier } from './collector.ts';
import type { CoreTypes } from '../lib.ts';
import type {
  CheckedAccessRecord,
  CheckedEnumTypeVariant,
  CheckedExpression,
  CheckedSetLiteralEx,
  CheckedStatement,
  CheckedTypeExpression,
} from './checkerAst.ts';
import {
  CheckedAccessEx,
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
  CheckedStaticAccessEx,
  CheckedStringLiteralEx,
  CheckedStructDeclare,
  CheckedStructField,
  CheckedStructType,
  CheckedTypeParameterType,
} from './checkerAst.ts';
import type {
  ParserExpression,
  ParserFile,
  ParserFunctionStatement,
  ParserMapLiteralEx,
  ParserParameter,
  ParserStatement,
} from '../parser/parserAst.ts';
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
  ParserExpressionStatement,
  ParserFloatLiteralEx,
  ParserFunctionDeclare,
  ParserIdentifierEx,
  ParserIfEx,
  ParserImportDeclaration,
  ParserIntLiteralEx,
  ParserIsEx,
  ParserLambdaEx,
  ParserListLiteralEx,
  ParserNotEx,
  ParserOrEx,
  ParserReassignmentStatement,
  ParserReturnEx,
  ParserSetLiteralEx,
  ParserStaticAccessEx,
  ParserStringLiteralEx,
  ParserStructDeclare,
} from '../parser/parserAst.ts';

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
    const fileScope = Scope.init(declarations.map(symbol => this.#typeSymbolToPhaseType(symbol, filePos)), qualifier, file.module, this.#coreTypes.unit);

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
        });
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
        });
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
        });
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
      phase: 'const',
    });
  }

  checkIntLiteral(ex: ParserIntLiteralEx): CheckedIntLiteralEx {
    return new CheckedIntLiteralEx({
      pos: ex.pos,
      value: ex.value,
      type: this.#coreTypes.int,
      phase: 'const',
    });
  }

  checkFloatLiteral(ex: ParserFloatLiteralEx): CheckedFloatLiteralEx {
    return new CheckedFloatLiteralEx({
      pos: ex.pos,
      value: ex.value,
      type: this.#coreTypes.float,
      phase: 'const',
    });
  }

  checkStringLiteral(ex: ParserStringLiteralEx): CheckedStringLiteralEx {
    return new CheckedStringLiteralEx({
      pos: ex.pos,
      value: ex.value,
      type: this.#coreTypes.string,
      phase: 'const',
    });
  }

  checkIdentifier(ex: ParserIdentifierEx, scope: Scope): CheckedIdentifierEx {
    const got = scope.get(ex.name, ex.pos);

    return new CheckedIdentifierEx({
      pos: ex.pos,
      name: ex.name,
      type: got.type,
      phase: got.phase,
    });
  }

  checkIs(ex: ParserIsEx, scope: Scope): CheckedIsEx {
    const base = this.#checkExpression(ex.base, scope, undefined);

    return new CheckedIsEx({
      pos: ex.pos,
      not: ex.not,
      base,
      check: scope.qualifier.checkTypeExpression(ex.check),
      type: this.#coreTypes.boolean,
      phase: base.phase,
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
        phase: base.phase,
      }),
      base,
      type,
      phase: base.phase,
    });
  }

  checkStaticAccess(ex: ParserStaticAccessEx, scope: Scope): CheckedStaticAccessEx {
    const [first, ...rest] = ex.path.toArray();

    const init = this.checkIdentifier(first!, scope);
    const path = List.of(init).asMutable();
    let prev = init.type;

    for (const next of rest) {
      if (prev instanceof CheckedModuleType) {
        const child = this.#declarations.get(prev.name.package)?.get(prev.name.child(next.name)) ?? next.pos.fail(`No such import found ${prev.name}`);
        path.push(new CheckedIdentifierEx({
          pos: next.pos,
          name: next.name,
          type: child.type,
          phase: 'const',
        }));
        prev = child.type;
      } else if (prev instanceof CheckedEnumType) {
        const variant = prev.variants.get(next.name) ?? next.pos.fail(`No such enum variant found ${prev.name}`);
        path.push(new CheckedIdentifierEx({
          pos: next.pos,
          name: next.name,
          type: variant,
          phase: 'const',
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
      phase: 'const',
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

        const actualFields = ex.fields.toOrderedMap().mapKeys((_, it) => it.name);

        // TODO: constructors can't explicitly declare generics, but they should be able to
        // now we need to confirm that the given expressions match the type we started with
        const genericParams = baseType instanceof CheckedStructType ? baseType.typeParams : this.#genericsOfEnum(baseType);
        const namesToPairs = actualFields.map((constructEntry, name) => {
          const expected = expectedFields.get(name) ?? ex.pos.fail('This should not happen. A constructor is missing a required field after it was already checked');
          return {
            actual: constructEntry.value,
            expected,
          };
        });

        const { typeArgs, args } = this.#fullChecking(namesToPairs, scope, ex.pos, genericParams);

        const baseName = new CheckedNominalType({name: baseType.name});

        const type = genericParams.isEmpty()
          ? baseName
          : new CheckedParameterizedType({ base: baseName, args: typeArgs });

        return new CheckedConstructEx({
          pos: ex.pos,
          base,
          typeArgs,
          fields: ex.fields.map(it => {
            const ex = args.get(it.name) ?? it.pos.fail('This should never happen, an argument was provided but not returned from fullChecking');

            return new CheckedConstructEntry({name: it.name, value: ex, pos: ex.pos});
          }),
          type,
          phase: this.#phaseCheck(args.valueSeq().toList()),
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
      return ex.pos.fail('Attempt to construct non-constructable');
    }
  }

  checkCall(ex: ParserCallEx, scope: Scope): CheckedCallEx {
    const func = this.#checkExpression(ex.func, scope, undefined);
    const funcType = func.type;

    if (funcType instanceof CheckedFunctionType) {
      // TODO: handle default arguments
      // TODO: handle generics in the expected type, that matters
      if (funcType.params.size === ex.args.size) {
        const rawArgs = funcType.params.zipWith((expected: CheckedFunctionTypeParameter, actual: ParserExpression) => ({expected: expected.type, actual}), ex.args).toOrderedMap();

        const { typeArgs, args } = this.#fullChecking(rawArgs, scope, ex.pos, funcType.typeParams);
        const typeParams = funcType.typeParams.toOrderedMap()
          .mapEntries(([index, value]) => {
            return [value.name, typeArgs.get(index)!];
          });

        const phaseParams = args.map((arg, index) => {
          const param = funcType.params.get(index) ?? ex.pos.fail("This should never happen, `fullChecking` didn't return an argument");

          return {
            expectedPhase: param.phase,
            arg,
          };
        }).valueSeq().toList();

        return new CheckedCallEx({
          pos: ex.pos,
          func,
          args: ex.args.map((_, index) => args.get(index) ?? ex.pos.fail("This should never happen, `fullChecking` didn't return an argument")),
          typeArgs,
          type: this.#fillGenericTypes(funcType.result, ex.pos, typeParams),
          phase: this.#phaseCheckCall(phaseParams, funcType.phase),
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
          const expected = funcType.params.get(index)!;
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
          // TODO: we're just temporarily assuming that these are only 'fun'
          phase: this.#phaseCheckCall(resolvedFields.map(arg => ({arg, expectedPhase: undefined})), 'fun'),
        });
      }

      // no branches worked, fail
      return ex.pos.fail('No overload found for arguments');
    } else if (funcType instanceof CheckedEnumTypeTupleVariant) {
      // this is a copy of the function checking code, slightly tweaked
      // TODO: handle default arguments
      // TODO: handle generics in the expected type, that matters
      if (funcType.fields.size === ex.args.size) {
        const genericParams = this.#genericsOfEnum(funcType);
        const rawArgs = funcType.fields.zipWith((expected, actual: ParserExpression) => ({expected, actual}), ex.args).toOrderedMap();

        const { typeArgs, args } = this.#fullChecking(rawArgs, scope, ex.pos, genericParams);
        const typeParams = genericParams.toOrderedMap()
          .mapEntries(([index, value]) => {
            return [value.name, typeArgs.get(index)!];
          });

        return new CheckedCallEx({
          pos: ex.pos,
          func,
          args: ex.args.map((_, index) => args.get(index) ?? ex.pos.fail("This should never happen, `fullChecking` didn't return an argument")),
          typeArgs,
          type: this.#fillGenericTypes(funcType, ex.pos, typeParams),
          phase: this.#phaseCheckCall(args.valueSeq().map(arg => ({arg, expectedPhase: undefined})).toList(), 'fun'),
        });
      } else {
        return ex.pos.fail(`Tuple ${func.pos} expects ${funcType.fields.size} arguments but found ${ex.args.size} arguments instead`);
      }
    } else {
      return ex.pos.fail('Attempt to call non-callable');
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
      phase: this.#phaseCheck(List.of(left, right)),
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
      phase: this.#phaseCheck(List.of(left, right)),
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
      phase: this.#phaseCheck(List.of(base), 'fun'),
    });
  }

  checkIf(ex: ParserIfEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedIfEx {
    const condition = this.#checkExpression(ex.condition, scope, this.#coreTypes.boolean);
    const thenEx = this.#checkExpression(ex.thenEx, scope, expected);
    const elseEx = ex.elseEx === undefined ? undefined : this.#checkExpression(ex.elseEx, scope, expected);

    if (!condition.type.equals(this.#coreTypes.boolean)) {
      condition.pos.fail(`Condition of 'if' should be a boolean but is actually '${condition.type}'`);
    }

    const exprs = List.of(condition, thenEx).asMutable();

    if (elseEx !== undefined) {
      exprs.push(elseEx);
    }

    return new CheckedIfEx({
      pos: ex.pos,
      condition,
      thenEx,
      elseEx,
      type: elseEx === undefined ? this.#coreTypes.optionOf(thenEx.type) : this.#mergeTypes(thenEx.type, elseEx.type, ex.pos),
      phase: this.#phaseCheck(exprs.asImmutable()),
    });
  }

  #checkLambdaBody(ex: ParserLambdaEx, scope: Scope, params: List<CheckedParameter>, expectedResult: CheckedTypeExpression | undefined): CheckedLambdaEx {
    // TODO: I'm not sure if 'Nothing' is actually going to work here, make sure to test that
    // TODO: create a system to give annon lambdas names
    const childScope = scope.childFunction(scope.functionScope.symbol.child('<lambda>'), expectedResult ?? this.#coreTypes.nothing, ex.functionPhase);

    for (const param of params) {
      childScope.set(param.name, new PhaseType(param.type, param.phase ?? 'val', param.pos));
    }

    const body = this.#checkExpression(ex.body, childScope, expectedResult);
    const closures = childScope.functionScope.closures;
    const phase = this.#phaseCheckImpl(closures.valueSeq().map(it => ({pos: it.pos, phase: it.phase, expectedPhase: undefined})).toList(), ex.functionPhase);

    return new CheckedLambdaEx({
      pos: ex.pos,
      phase,
      functionPhase: ex.functionPhase,
      params,
      body,
      type: new CheckedFunctionType({
        phase: ex.functionPhase,
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

  checkLambda(ex: ParserLambdaEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedLambdaEx {
    if (expected instanceof CheckedFunctionType) {
      if (ex.params.size !== expected.params.size) {
        ex.pos.fail(`Wrong number of arguments, expected function with arguments '${expected.params}' but found ${ex.params.size} arguments`);
      }

      // we can spot check the expected types whenever we don't have them (and only when we need to check)

      const expectedResult = expected.result;
      const params = ex.params.map((it, index) => {
        const type = it.type === undefined
          ? expected.params.get(index)!.type // no type specified, look it up from expected
          : scope.qualifier.checkTypeExpression(it.type);

        return new CheckedParameter({
          pos: it.pos,
          phase: it.phase,
          name: it.name,
          type,
        });
      });

      return this.#checkLambdaBody(ex, scope, params, expectedResult);
    } else {
      // our lambda had better explicitly declare all of its args or we throw up
      const params = ex.params.map(it => {
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

      return this.#checkLambdaBody(ex, scope, params, undefined);
    }
  }

  checkBlock(ex: ParserBlockEx, parentScope: Scope, expected: CheckedTypeExpression | undefined): CheckedBlockEx {
    if (ex.body.isEmpty()) {
      return new CheckedBlockEx({
        pos: ex.pos,
        body: List(),
        type: this.#coreTypes.unit,
        phase: 'const',
      });
    }

    const scope = parentScope.child();

    // all but the last statement
    const initBody: List<CheckedStatement> = ex.body.shift().map(state => this.checkStatement(state, scope, undefined));
    // the last statement is the only one that gets expected, and the only one who's type matters
    const last = this.checkStatement(ex.body.last(), scope, expected);
    const body = initBody.push(last);

    return new CheckedBlockEx({
      pos: ex.pos,
      body,
      type: last.type,
      phase: last.phase,
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
    if ( (state.phase === 'var' || state.phase === 'flow') && scope.functionScope.phase !== 'def') {
      return state.pos.fail(`Attempt to assign a '${state.phase}' inside a '${scope.functionScope.phase}' function. Only a 'def' function can create a 'var' or 'flow'`);
    }

    const expectedType = state.type === undefined ? undefined : scope.qualifier.checkTypeExpression(state.type);
    const expression = this.#checkExpression(state.expression, scope, expectedType);

    if (expectedType !== undefined && !this.#checkAssignable(expression.type, expectedType)) {
      expression.pos.fail(`Expected type '${expectedType}' but found type '${expression.type}'`);
    }

    switch (state.phase) {
      case 'const':
        if (expression.phase !== 'const') {
          return expression.pos.fail(`Attempt to assign a '${expression.phase}' expression to a 'const'. Only a 'const' expression can be assigned to a 'const'`);
        }
        break;
      case 'val':
      case 'var':
        if (expression.phase === 'var' || expression.phase === 'flow') {
          return expression.pos.fail(`Attempt to assign a '${expression.phase}' expression to a '${state.phase}'. Only a 'const' or 'val' expression can be assigned to a '${state.phase}'`);
        }
        break;
      case 'flow':
        // everything is allowed to be a flow
    }

    const type = expectedType ?? expression.type;

    scope.set(state.name, new PhaseType(type, state.phase, state.pos));

    return new CheckedAssignmentStatement({
      pos: state.pos,
      phase: state.phase,
      name: state.name,
      expression,
      type: this.#coreTypes.unit,
    });
  }

  checkReassignmentStatement(state: ParserReassignmentStatement, scope: Scope): CheckedReassignmentStatement {
    if (scope.functionScope.phase !== 'sig') {
      return state.pos.fail(`Attempt to update a 'var' inside a '${scope.functionScope.phase}' function. Only a 'sig' function is permitted to update a 'var'`);
    }

    const id = scope.get(state.name, state.pos);

    if (id.phase !== 'var') {
      return state.pos.fail(`Attempt to update a '${id.phase}'. Only a 'var' can be updated`);
    }

    const expression = this.#checkExpression(state.expression, scope, id.type);

    if (!this.#checkAssignable(expression.type, id.type)) {
      state.pos.fail(`Expected assignment of type '${id.type}' but found value of type '${expression.type}'`);
    }

    return new CheckedReassignmentStatement({
      pos: state.pos,
      name: state.name,
      expression,
      type: this.#coreTypes.unit,
      phase: 'val',
    });
  }

  checkExpressionStatement(state: ParserExpressionStatement, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedExpressionStatement {
    const expression = this.#checkExpression(state.expression, scope, expected);

    return new CheckedExpressionStatement({
      pos: state.pos,
      expression,
      type: expression.type,
      phase: expression.phase,
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

    switch (state.lambda.functionPhase) {
      case 'fun':
        for (const param of params) {
          if (param.phase === 'var' || param.phase === 'flow') {
            param.pos.fail(`Attempt to require a '${param.phase}' parameter in a 'fun' function. A 'fun' function can only have 'const' or 'val' parameters`);
          }
        }
        break;
      case 'sig':
        for (const param of params) {
          if (param.phase === 'flow') {
            param.pos.fail('Attempt to require a \'flow\' parameter in a \'sig\' function. A \'sig\' function can only have \'const\', \'val\', or \'flow\' parameters');
          }
        }
        break;
      case 'def': // def is safe to require anything
        break;
    }

    const result = scope.qualifier.checkTypeExpression(state.result);

    const childScope = scope.childFunction(symbol, result, state.lambda.functionPhase);

    const typeParams = state.typeParams.map(typeParam => {
      return new CheckedTypeParameterType({
        name: symbol.child(typeParam.name),
      });
    });

    for (const typeParam of typeParams) {
      childScope.set(typeParam.name.name, new PhaseType(typeParam, 'val', state.pos));
    }

    for (const param of params) {
      childScope.set(param.name, new PhaseType(param.type, param.phase ?? 'val', param.pos));
    }

    const body = this.#checkExpression(state.lambda.body, childScope, result);
    const closures = childScope.functionScope.closures;
    const phase = this.#phaseCheckImpl(closures.valueSeq().map(it => ({pos: it.pos, phase: it.phase, expectedPhase: undefined})).toList(), state.lambda.functionPhase);

    if (state.phase !== phase) {
      state.pos.fail(`Attempt to declare '${state.phase}' function, but body is actually '${phase}'. This function must close over values outside of the allowed phase.`);
    }

    const type = new CheckedFunctionType({
      phase: state.lambda.functionPhase,
      typeParams,
      params: params.map(it => {
        return new CheckedFunctionTypeParameter({
          phase: it.phase,
          type: it.type,
        });
      }),
      result,
    });

    scope.set(state.name, new PhaseType(type, state.phase, state.pos));

    return new CheckedFunctionStatement({
      pos: state.pos,
      phase: state.phase,
      lambda: new CheckedLambdaEx({
        pos: state.pos,
        functionPhase: state.lambda.functionPhase,
        params,
        body,
        type,
        phase: state.phase,
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
      phase: base.phase,
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
      phase: this.#phaseCheck(values),
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
      phase: this.#phaseCheck(values),
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
        value: this.#checkExpression(item.value, scope, expectedValue),
      });
    });
    const keyType = this.#mergeList(entries.map(it => it.key.type), expectedKey ?? this.#coreTypes.nothing, ex.pos);
    const valueType = this.#mergeList(entries.map(it => it.value.type), expectedValue ?? this.#coreTypes.nothing, ex.pos);

    return new CheckedMapLiteralEx({
      pos: ex.pos,
      values: entries,
      type: this.#coreTypes.mapOf(keyType, valueType),
      phase: this.#phaseCheck(entries.flatMap(it => List.of(it.key, it.value))),
    });
  }

  #genericsOfEnum(ex: CheckedEnumTypeVariant): List<CheckedTypeParameterType> {
    const base = this.#declarations.get(ex.name.package)?.get(ex.name.parent()!);

    if (base?.type instanceof CheckedEnumType) {
      return base.type.typeParams;
    } else {
      return ex.pos.fail("Expected enum type but didn't find it.");
    }
  }

  #recursiveGenericsLookup(expected: CheckedTypeExpression | undefined, actual: CheckedTypeExpression | undefined, expectedGenerics: Set<Symbol>, collector: (symbol: Symbol, type: CheckedTypeExpression) => void): void {
    if (expected === undefined || actual === undefined) {
      return;
    } else if (expected instanceof CheckedTypeParameterType) {
      if (expectedGenerics.has(expected.name)) {
        collector(expected.name, actual);
      }
    } else if (expected instanceof CheckedParameterizedType) {
      if (actual instanceof CheckedParameterizedType) {
        expected.args.zip<CheckedTypeExpression>(actual.args).forEach(([ex, act]) => this.#recursiveGenericsLookup(ex, act, expectedGenerics, collector));
      }
    } else if (expected instanceof CheckedFunctionType) {
      if (actual instanceof CheckedFunctionType) {
        expected.params.zip<CheckedTypeExpression>(actual.params).forEach(([ex, act]) => this.#recursiveGenericsLookup(ex, act, expectedGenerics, collector));
        this.#recursiveGenericsLookup(expected.result, actual.result, expectedGenerics, collector);
      }
    }
  }

  #phaseCheck(args: List<CheckedExpression>, functionPhase: FunctionPhase = 'fun'): ExpressionPhase {
    return this.#phaseCheckImpl(args.map(arg => ({phase: arg.phase, pos: arg.pos, expectedPhase: undefined})), functionPhase);
  }

  #phaseCheckCall(pairs: List<{ arg: CheckedExpression, expectedPhase: ExpressionPhase | undefined }>, functionPhase: FunctionPhase): ExpressionPhase {
    return this.#phaseCheckImpl(pairs.map(({arg, expectedPhase}) => ({phase: arg.phase, pos: arg.pos, expectedPhase})), functionPhase);
  }

  #phaseCheckImpl(pairs: List<{ phase: ExpressionPhase, expectedPhase: ExpressionPhase | undefined, pos: Position }>, functionPhase: FunctionPhase): ExpressionPhase {
    const highestPhase = pairs.map<'const' | 'val' | 'flow'>(({ phase, pos, expectedPhase }) => {
      switch (expectedPhase) {
        case 'var':
          // only a var can be passed to a var
          if (phase !== 'var') {
            pos.fail(`Expected 'var' parameter, found '${phase}' argument`);
          }

          return 'flow';
        case 'flow':
          // a var or flow are acceptable for a flow parameter
          if (phase !== 'var' && phase !== 'flow') {
            pos.fail(`Expected 'flow' parameter, found '${phase}' argument`);
          }

          return 'flow';
        case 'val':
          // only an explicit val or const are legal
          if (phase !== 'val' && phase !== 'const') {
            pos.fail(`Expected 'val' parameter, found '${phase}' argument`);
          }

          return 'val';
        case 'const':
          // only an explicit const is legal
          // only an explicit val or const are legal
          if (phase !== 'const') {
            pos.fail(`Expected 'const' parameter, found '${phase}' argument`);
          }

          return 'const';
        case undefined:
          // any value is legal here
          switch (phase) {
            case 'var':
            case 'flow':
              return 'flow';
            case 'val':
              return 'val';
            case 'const':
              return 'const';
          }
      }
    }).reduce<'const' | 'val' | 'flow'>((prev, sum) => {
      if (prev === 'flow' || sum === 'flow') {
        return 'flow';
      }

      if (prev === 'val' || sum === 'val') {
        return 'val';
      }

      return 'const';
    }, 'const');

    switch (functionPhase) {
      case 'sig':
        // for now, sigs have no limits and always return 'val'
        return 'val';
      case 'def':
        // defs always return a 'flow' no matter what
        return 'flow';
      case 'fun':
        // a fun returns the highest value
        return highestPhase;
    }
  }

  //TODO: someday have a way to handle default values, meaning optional actual values
  #fullChecking<MapKey extends number | string>(pairs: Map<MapKey, { actual: ParserExpression, expected: CheckedTypeExpression }>, scope: Scope, pos: Position, genericParams: List<CheckedTypeParameterType>): { typeArgs: List<CheckedTypeExpression>, args: Map<MapKey, CheckedExpression> } {
    if (genericParams.isEmpty()) {
      return {
        typeArgs: List(),
        args: pairs.map(({actual, expected}) => this.#checkExpression(actual, scope, expected)),
      };
    }

    const expectedGenerics = genericParams.map(it => it.name).toSet();
    const resolvedGenerics = List<{ symbol: Symbol, pos: Position, type: CheckedTypeExpression }>().asMutable();
    const checkedArgs = Map<MapKey, CheckedExpression>().asMutable();

    // check all non-lambdas, use lambda known types
    pairs.forEach(({actual, expected}, key) => {
      if (actual instanceof ParserLambdaEx) {
        if (expected instanceof CheckedFunctionType) {
          expected.params.zip<ParserParameter>(actual.params).forEach(([ex, act]) => {
            const type = act.type;

            if (type !== undefined) {
              this.#recursiveGenericsLookup(ex, scope.qualifier.checkTypeExpression(type), expectedGenerics, (symbol, type) => {
                resolvedGenerics.push({symbol, pos: act.pos, type});
              });
            }
          });
          // TODO: when we add syntax for explicit lambda return values, use that data here too
        }
      } else {
        const checkedEx = this.#checkExpression(actual, scope, expected);

        this.#recursiveGenericsLookup(expected, checkedEx.type, expectedGenerics, (symbol, type) => resolvedGenerics.push({symbol, type, pos: checkedEx.pos}));
        checkedArgs.set(key, checkedEx);
      }
    });

    // generics before we've checked lambdas
    const actualGenericsPreLambda = resolvedGenerics.groupBy(it => it.symbol).map(list => {
      return list.reduce<CheckedTypeExpression>((left, right) => this.#mergeTypes(left, right.type, right.pos), this.#coreTypes.nothing);
    });

    // check lambdas
    pairs.forEach(({actual, expected}, key) => {
      if (actual instanceof ParserLambdaEx && expected instanceof CheckedFunctionType) {
        const actualGenericsPlusHoles = actualGenericsPreLambda.asMutable();
        expectedGenerics.forEach(name => {
          if (!actualGenericsPlusHoles.has(name)) {
            // fill in holes with `Nothing`
            actualGenericsPlusHoles.set(name, this.#coreTypes.nothing);
          }
        });

        const expectedType = this.#fillGenericTypes(expected, pos, actualGenericsPlusHoles.asImmutable());
        const checkedEx = this.checkLambda(actual, scope, expectedType);

        this.#recursiveGenericsLookup(expected, checkedEx.type, expectedGenerics, (symbol, type) => resolvedGenerics.push({symbol, type, pos: checkedEx.pos}));
        checkedArgs.set(key, checkedEx);
      }
    });

    // generics with lambdas included
    const actualGenerics = resolvedGenerics.groupBy(it => it.symbol).map(list => {
      return list.reduce<CheckedTypeExpression>((left, right) => this.#mergeTypes(left, right.type, right.pos), this.#coreTypes.nothing);
    });

    // make sure that all generics have been filled
    const actualTypeArgs = genericParams.map(it => actualGenerics.get(it.name) ?? pos.fail(`Unable to determine generic type ${it.name}`));

    // make sure that all types are actually assignable
    pairs.forEach(({actual, expected}, key) => {
      const expectedWithGenerics = this.#fillGenericTypes(expected, pos, actualGenerics);
      const checkedActual = checkedArgs.get(key) ?? pos.fail(`No checked value found for key ${key}, this should not be possible!`);

      if (!this.#checkAssignable(checkedActual.type, expectedWithGenerics)) {
        return actual.pos.fail(`Type ${actual} is not assignable to expected type ${expectedWithGenerics}`);
      } else {
        return checkedActual;
      }
    });

    return {
      typeArgs: actualTypeArgs,
      args: checkedArgs,
    };
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

    if (actual instanceof CheckedParameterizedType && expected instanceof CheckedParameterizedType) {
      return actual.base.name.equals(expected.base.name) && this.#checkAllAssignable(actual.args, expected.args);
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
      return pos.fail('Incompatible with other type');
    }
  }

  #checkAssignableFunctionTypes(actual: CheckedFunctionType, expected: CheckedFunctionType): boolean {
    // results are checked backwards because of contravariance
    return actual.phase === expected.phase && this.#checkAssignable(expected.result, actual.result) && actual.params.size === expected.params.size &&
      // TODO: consider how to compare phases. For now demand they are exactly equal
      actual.params.zip<CheckedFunctionTypeParameter>(expected.params).every(([left, right]) => (left.phase ?? 'val') === (right.phase ?? 'val') && this.#checkAssignable(left.type, right.type));
  }

  #typeSymbolToPhaseType(symbol: Symbol, pos: Position): PhaseType {
    const pack = this.#declarations.get(symbol.package);

    if (pack === undefined) {
      return pos.fail(`Failed to find '${symbol}'`);
    }

    const record = pack.get(symbol);

    if (record === undefined) {
      return pos.fail(`Failed to find '${symbol}'`);
    }

    // TODO: do we need to check access here? In theory it's already been checked ..
    return new PhaseType(record.type, 'const', pos);
  }

  #processAccess(type: CheckedTypeExpression, id: ParserIdentifierEx): CheckedTypeExpression {
    if (type instanceof CheckedStructType || type instanceof CheckedEnumTypeStructVariant) {
      return type.fields.get(id.name) ?? id.pos.fail(`Not able to find field ${id.name} on type ${type.name}`);
    } else if (type instanceof CheckedEnumTypeTupleVariant) {
      if (id.name.startsWith('v')) {
        const num = Number.parseInt(id.name.substring(1));

        if (Number.isSafeInteger(num) && num < type.fields.size) {
          return type.fields.get(num)!;
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
        return id.pos.fail('Parameterized type has no fields');
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
    const declarations = this.#declarations;

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
        const realType = declarations.get(ex.name.package)?.get(ex.name)?.type;

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

  readonly #closures = Map<string, PhaseType>().asMutable();
  readonly symbol: Symbol;
  readonly phase: FunctionPhase;
  resultType: CheckedTypeExpression;

  constructor(symbol: Symbol, resultType: CheckedTypeExpression, phase: FunctionPhase) {
    this.symbol = symbol;
    this.resultType = resultType;
    this.phase = phase;
  }

  get closures(): Map<string, PhaseType> {
    return this.#closures.asImmutable();
  }

  addClosure(name: string, type: PhaseType): void {
    this.#closures.set(name, type);
  }

}

export class PhaseType extends Record({
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
  pos: undefined as unknown as Position,
}) {
  constructor(type: CheckedTypeExpression, phase: ExpressionPhase, pos: Position) {
    super({type, phase, pos});
  }
}

export class Scope {
  readonly #parent: Scope | undefined;
  readonly #symbols: Map<string, PhaseType>;
  readonly qualifier: Qualifier;
  readonly functionScope: FunctionScope;

  private constructor(parent: Scope | undefined, declared: Map<string, PhaseType> | undefined, qualifier: Qualifier, functionScope: FunctionScope) {
    this.#parent = parent;
    this.#symbols = (declared ?? Map<string, PhaseType>()).asMutable();
    this.qualifier = qualifier;
    this.functionScope = functionScope;
  }

  static init(declared: Map<string, PhaseType>, qualifier: Qualifier, symbol: Symbol, resultType: CheckedTypeExpression): Scope {
    return new Scope(undefined, declared, qualifier, new FunctionScope(symbol, resultType, 'fun'));
  }

  child(): Scope {
    return new Scope(this, undefined, this.qualifier, this.functionScope);
  }

  childFunction(symbol: Symbol, resultType: CheckedTypeExpression, phase: FunctionPhase): Scope {
    return new Scope(this, undefined, this.qualifier, new FunctionScope(symbol, resultType, phase));
  }

  get(name: string, pos: Position): PhaseType {
    const maybe = this.#symbols.get(name);

    if (maybe !== undefined) {
      return maybe;
    }

    if (this.#parent !== undefined) {
      const parentResult = this.#parent.get(name, pos);

      // this check is on object identity on propose
      // if we found a value from a different function, that means this function is closing over a value
      // from an above function, thus it needs to be counted in our closures
      if (this.#parent.functionScope !== this.functionScope) {
        this.functionScope.addClosure(name, parentResult);

        if (this.functionScope.phase === 'fun' && (parentResult.phase === 'var' || parentResult.phase === 'flow')) {
          return parentResult.set('phase', 'val');
        }
      }

      return parentResult;
    }

    return pos.fail(`Could not find '${name}' in scope`);
  }

  set(name: string, type: PhaseType): void {
    this.#symbols.set(name, type);
  }
}
