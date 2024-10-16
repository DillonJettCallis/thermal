import {
  AccessExpression,
  AccessRecord,
  AndExpression, AssignmentStatement, BlockEx,
  BooleanLiteralEx,
  CallEx,
  ConstructExpression,
  DependencyManager,
  EnumType,
  EnumTypeStructVariant,
  EnumTypeTupleVariant,
  EnumTypeVariant,
  Expression, ExpressionStatement,
  File,
  FloatLiteralEx, FunctionStatement,
  FunctionType,
  FunctionTypeParameter,
  IdentifierEx,
  IfEx,
  IntLiteralEx,
  IsExpression, LambdaEx,
  ListLiteralEx,
  MapLiteralEx,
  NominalType,
  NotExpression,
  OrExpression,
  OverloadFunctionType,
  PackageName, Parameter,
  ParameterizedType,
  Position, ReassignmentStatement, ReturnEx,
  SetLiteralEx, Statement,
  StaticAccessExpression,
  StringLiteralEx,
  StructType,
  Symbol,
  Typed,
  TypedConstructFieldExpression, TypedStatement,
  TypeExpression,
  TypeParameterType,
  typesEqual
} from "../ast.js";
import { List, Map, Seq, Set } from "immutable";
import { collectDeclarations, Qualifier } from "./collector.js";
import { zip } from "../utils.js"
import { CoreTypes } from "../lib.js";


export class Checker {
  readonly #manager: DependencyManager;
  readonly #declarations: Map<PackageName, Map<Symbol, AccessRecord>>;
  readonly #coreTypes: CoreTypes;
  readonly #preamble: Map<string, Symbol>;
  readonly #rules: List<Rule<Expression>>;

  constructor(manager: DependencyManager, declarations: Map<PackageName, Map<Symbol, AccessRecord>>, coreTypes: CoreTypes, preamble: Map<string, Symbol>) {
    this.#manager = manager;
    this.#declarations = declarations;
    this.#coreTypes = coreTypes;
    this.#preamble = preamble;
    this.#rules = this.#initRules();
  }

  checkFile(file: File): void {
    const declarations = collectDeclarations(file, this.#manager, this.#preamble);
    const filePos = new Position(file.src, 0, 0);
    const qualifier = new Qualifier(declarations);
    const fileScope = Scope.init(declarations.map(symbol => this.#typeSymbolToTypeExpression(symbol, filePos)), qualifier, file.module, this.#coreTypes.unit);

    file.declarations.forEach(dec => {
      // TODO: check constants

      if (dec.kind === 'function') {
        const funcScope = fileScope.childFunction(dec.symbol, qualifier.checkTypeExpression(dec.resultType));

        // add params, which for a function declare aren't allowed to be null so we just assert that
        dec.params.forEach(param => {
          funcScope.set(param.name, qualifier.checkTypeExpression(param.type!!));
        });

        dec.body = this.#checkExpression(funcScope, dec.body, undefined) as Expression
      }
    });
  }

  #checkExpression<Ex extends Expression>(scope: Scope, ex: Ex, expected: TypeExpression | undefined): Typed<Ex> {
    // we have to cast the rule to Rule<Ex> because we know the rule must have passed the test but typescript doesn't know that
    // undefined means it wasn't found at all, which is an error
    const rule = this.#rules.find(it => it.test(ex, expected)) as Rule<Ex> | undefined;

    if (rule === undefined) {
      return ex.pos.fail('No rule to check expression');
    } else {
      return rule.type(scope, ex, expected);
    }
  }

  #initRules(): List<Rule<Expression>> {
    // order does matter! The first rule that matches is taken
    return List.of<Rule<Expression>>(
      this.booleanRule(),
      this.intRule(),
      this.floatRule(),
      this.stringRule(),
      this.identifierRule(),
      this.accessRule(),
      this.staticAccessRule(),
      this.constructRule(),
      this.callRule(),
      // boolean rules
      this.isRule(),
      this.orRule(),
      this.andRule(),
      this.notRule(),
      this.ifRule(),

      this.lambdaRule(),
      this.blockRule(),
      this.returnRule(),

      // collection literals
      this.listExpectingNoneRule(),
      this.listExpectingSomeRule(),
      this.setExpectingNoneRule(),
      this.setExpectingSomeRule(),
      this.mapExpectingNoneRule(),
      this.mapExpectingSomeRule(),
    );
  }

  booleanRule(): Rule<BooleanLiteralEx> {
    return this.#literalRule('booleanLiteral', this.#coreTypes.boolean);
  }

  intRule(): Rule<IntLiteralEx> {
    return this.#literalRule('intLiteral', this.#coreTypes.int);
  }

  floatRule(): Rule<FloatLiteralEx> {
    return this.#literalRule('floatLiteral', this.#coreTypes.float);
  }

  stringRule(): Rule<StringLiteralEx> {
    return this.#literalRule('stringLiteral', this.#coreTypes.string);
  }

  identifierRule(): Rule<IdentifierEx> {
    return this.#expressionRule<IdentifierEx>('identifier', (scope, id, _expected) => {
      return {
        ...id,
        type: scope.get(id.name, id.pos),
      }
    })
  }

  isRule(): Rule<IsExpression> {
    return this.#expressionRule<IsExpression>('is', (scope, ex) => {
      return {
        ...ex,
        base: this.#checkExpression(scope, ex.base, undefined),
        check: scope.qualifier.checkTypeExpression(ex.check),
        type: this.#coreTypes.boolean,
      };
    })
  }

  accessRule(): Rule<AccessExpression> {
    return this.#expressionRule<AccessExpression>('access', (scope, ex) => {
      const base = this.#checkExpression(scope, ex.base, undefined);
      const type = this.#processAccess(base.type, ex.field);

      return {
        ...ex,
        field: {
          ...ex.field,
          type,
        },
        base,
        type,
      }
    })
  }

  staticAccessRule(): Rule<StaticAccessExpression> {
    return this.#expressionRule<StaticAccessExpression>('staticAccess', (scope, ex) => {
      const [first, ...rest] = ex.path;

      const init = this.#checkExpression(scope, first!!, undefined);
      const path = [init];
      let prev = init.type;

      for (const next of rest) {
        switch (prev.kind) {
          case 'module':
            const child = this.#declarations.get(prev.name.package)?.get(prev.name.child(next.name)) ?? next.pos.fail(`No such import found ${prev.name}`);
            path.push({
              ...next,
              type: child.type,
            });
            prev = child.type;
            break;
          case 'enum':
            const variant = prev.variants.get(next.name) ?? next.pos.fail(`No such enum variant found ${prev.name}`);
            path.push({
              ...next,
              type: variant
            });
            prev = variant;
            break;
          default:
            return next.pos.fail('No static members found');
        }
      }

      return {
        ...ex,
        path,
        type: prev,
      }
    })
  }

  constructRule(): Rule<ConstructExpression> {
    return this.#expressionRule<ConstructExpression>('construct', (scope, ex, expected) => {
      const base = this.#checkExpression(scope, ex.base, undefined);
      const baseType = base.type;

      if (baseType.kind === 'struct' || baseType.kind === 'enumStruct') {
        // TODO: I forgot to handle default values inside of struct types
        // for now, let's just ignore defaults and we'll handle it some other time
        const expectedKeys = baseType.fields.keySeq().toSet();
        const actualKeys = Seq(ex.fields).map(it => it.name).toSet();
        // TODO: check for duplicated fields

        if (expectedKeys.equals(actualKeys)) {
          const expectedFields = expected?.kind === 'struct' || expected?.kind === 'enumStruct'
            ? expected.fields
            : Map<string, TypeExpression>()
          ;

          // we can use any expected type information to resolve things like generics and lambdas
          const resolvedFields = List(ex.fields).toMap().mapKeys((_, it) => it.name).map(it => {
            return {
              pos: it.pos,
              name: it.name,
              value: this.#checkExpression(scope, it.value, expectedFields.get(it.name)),
            } satisfies TypedConstructFieldExpression;
          });

          // TODO: constructors can't explicitly declare generics, but they should be able to
          // now we need to confirm that the given expressions match the type we started with
          const genericParams = baseType.kind === 'struct' ? baseType.typeParams : this.#genericsOfEnum(baseType);
          const genericNames = Seq(genericParams).map(it => it.name).toSet();
          const actualRawGenerics = resolvedFields.reduce((sum, actual) => {
            const expected = baseType.fields.get(actual.name)!!;

            return sum.concat(this.#applyGenerics(expected, actual.value.type, genericNames));
          }, List<{ symbol: Symbol, type: TypeExpression }>());

          const actualGenerics = actualRawGenerics.groupBy(it => it.symbol).map(list => {
            return list.map(it => it.type).reduce<TypeExpression>((left, right) => {
              if (left === undefined) {
                return right;
              }

              return this.#mergeTypes(left, right);
            });
          });

          // make sure that all generics have been filled
          const actualTypeArgs = genericParams.map(it => actualGenerics.get(it.name) ?? ex.pos.fail(`Unable to determine generic type ${it.name}`));

          // make sure that all types are actually assignable
          baseType.fields.forEach((expected, key) => {
            const expectedWithGenerics = this.#fillGenericTypes(expected, actualGenerics);
            const actual = this.#fillGenericTypes(resolvedFields.get(key)?.value?.type ?? ex.pos.fail('This should not happen. A constructor is missing a required field after it was already checked'), actualGenerics);

            if (!this.#checkAssignable(actual, expectedWithGenerics)) {
              actual.pos.fail(`Type ${actual} is not assignable to expected type ${expectedWithGenerics}`);
            }
          });

          const baseName = {pos: ex.pos, kind: 'nominal', name: baseType.name} satisfies NominalType;

          const type = genericParams.length === 0
            ? baseName
            : { pos: ex.pos, kind: 'parameterized', base: baseName, args: actualTypeArgs } satisfies ParameterizedType;

          return {
            pos: ex.pos,
            base,
            kind: 'construct',
            fields: resolvedFields.valueSeq().toArray(),
            type,
          } satisfies Typed<ConstructExpression>;
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
    })
  }

  callRule(): Rule<CallEx> {
    return this.#expressionRule<CallEx>('call', (scope, ex, expected) => {
      const func = this.#checkExpression(scope, ex.func, undefined);
      const funcType = func.type;

      if (funcType.kind === 'function') {
        // TODO: handle default arguments
        // TODO: handle generics in the expected type, that matters
        if (funcType.params.length === ex.args.length) {
          // we can use any expected type information to resolve things like generics and lambdas
          const resolvedFields = ex.args.map((it, index) => this.#checkExpression(scope, it, funcType.params[index]?.type));

          // now we need to confirm that the given expressions match the type we started with
          const genericParams = funcType.typeParams;
          const genericNames = Seq(genericParams).map(it => it.name).toSet();
          const actualRawGenerics = resolvedFields.reduce((sum, actual, index) => {
            const expected = funcType.params[index]!!.type;

            return sum.concat(this.#applyGenerics(expected, actual.type, genericNames));
          }, List<{ symbol: Symbol, type: TypeExpression }>());

          const actualGenerics = actualRawGenerics.groupBy(it => it.symbol).map(list => {
            return list.map(it => it.type).reduce<TypeExpression>((left, right) => {
              if (left === undefined) {
                return right;
              }

              return this.#mergeTypes(left, right);
            });
          });

          // make sure that all generics have been filled
          const typeArgs = genericParams.map(it => actualGenerics.get(it.name) ?? ex.pos.fail(`Unable to determine generic type ${it.name}`));

          // make sure that all types are actually assignable
          funcType.params.forEach((expected, index) => {
            const expectedWithGenerics = this.#fillGenericTypes(expected.type, actualGenerics);
            const actual = this.#fillGenericTypes(resolvedFields[index]?.type ?? ex.pos.fail('This should not happen. A function call is missing a required argument after it was already checked'), actualGenerics);

            if (!this.#checkAssignable(actual, expectedWithGenerics)) {
              actual.pos.fail(`Type ${actual} is not assignable to expected type ${expectedWithGenerics}`);
            }
          });

          return {
            pos: ex.pos,
            func,
            kind: 'call',
            args: resolvedFields,
            typeArgs,
            type: this.#fillGenericTypes(funcType.result, actualGenerics),
          } satisfies Typed<CallEx>;
        } else {
          return ex.pos.fail(`Function ${func.pos} expects ${funcType.params.length} arguments but found ${ex.args.length} arguments instead`);
        }
      } else if (funcType.kind === 'overloadFunction') {
        // TODO: check overloads

        // overloads are not allowed to have generics
        // this is a copy of the above code, done in a loop, with generic handling removed

        // we can use any expected type information to resolve things like generics and lambdas
        branchLoop: for (const branch of funcType.branches) {
          const funcType = branch;
          const resolvedFields = ex.args.map((it, index) => this.#checkExpression(scope, it, funcType.params[index]?.type));

          // make sure that all types are actually assignable
          for (let index = 0; index < funcType.params.length; index++) {
            const expected = funcType.params[index]!!;
            const expectedWithGenerics = expected.type;
            const actual = resolvedFields[index]?.type ?? ex.pos.fail('This should not happen. A function call is missing a required argument after it was already checked');

            if (!this.#checkAssignable(actual, expectedWithGenerics)) {
              // this branch is not valid. Break here and try the next branch
              continue branchLoop;
            }
          }

          return {
            pos: ex.pos,
            func,
            kind: 'call',
            args: resolvedFields,
            typeArgs: [],
            type: funcType.result,
          } satisfies Typed<CallEx>;
        }

        // no branches worked, fail
        return ex.pos.fail('No overload found for arguments');
      } else {
        return ex.pos.fail('Attempt to call non-callable')
      }
    })
  }

  andRule(): Rule<AndExpression> {
    return this.#expressionRule<AndExpression>('and', (scope, ex) => {
      const left = this.#checkExpression(scope, ex.left, this.#coreTypes.boolean);
      const right = this.#checkExpression(scope, ex.right, this.#coreTypes.boolean);

      if (!typesEqual(left.type, this.#coreTypes.boolean)) {
        left.pos.fail(`Left side of '&&' should be a boolean but is actually '${left.type}'`);
      }

      if (!typesEqual(right.type, this.#coreTypes.boolean)) {
        right.pos.fail(`Right side of '&&' should be a boolean but is actually '${right.type}'`);
      }

      return {
        pos: ex.pos,
        kind: 'and',
        left,
        right,
        type: this.#coreTypes.boolean,
      };
    });
  }

  orRule(): Rule<OrExpression> {
    return this.#expressionRule<OrExpression>('or', (scope, ex) => {
      const left = this.#checkExpression(scope, ex.left, this.#coreTypes.boolean);
      const right = this.#checkExpression(scope, ex.right, this.#coreTypes.boolean);

      if (!typesEqual(left.type, this.#coreTypes.boolean)) {
        left.pos.fail(`Left side of '||' should be a boolean but is actually '${left.type}'`);
      }

      if (!typesEqual(right.type, this.#coreTypes.boolean)) {
        right.pos.fail(`Right side of '||' should be a boolean but is actually '${right.type}'`);
      }

      return {
        pos: ex.pos,
        kind: 'or',
        left,
        right,
        type: this.#coreTypes.boolean,
      };
    });
  }

  notRule(): Rule<NotExpression> {
    return this.#expressionRule<NotExpression>('not', (scope, ex) => {
      const base = this.#checkExpression(scope, ex.base, this.#coreTypes.boolean);

      if (!typesEqual(base.type, this.#coreTypes.boolean)) {
        base.pos.fail(`Base of side of '!' should be a boolean but is actually '${base.type}'`);
      }

      return {
        pos: ex.pos,
        kind: 'not',
        base,
        type: this.#coreTypes.boolean,
      };
    });
  }

  ifRule(): Rule<IfEx> {
    return this.#expressionRule('if', (scope, ex, expected) => {
      const condition = this.#checkExpression(scope, ex.condition, this.#coreTypes.boolean);
      const thenEx = this.#checkExpression(scope, ex.thenEx, expected);
      const elseEx = ex.elseEx === undefined ? undefined : this.#checkExpression(scope, ex.elseEx, expected);

      if (!typesEqual(condition.type, this.#coreTypes.boolean)) {
        condition.pos.fail(`Condition of 'if' should be a boolean but is actually '${condition.type}'`);
      }

      return {
        pos: ex.pos,
        kind: 'if',
        condition,
        thenEx,
        elseEx,
        type: elseEx === undefined ? this.#coreTypes.optionOf(thenEx.type) : this.#mergeTypes(thenEx.type, elseEx.type),
      } satisfies Typed<IfEx>;
    });
  }

  lambdaRule(): Rule<LambdaEx> {
    return this.#expressionRule<LambdaEx>('function', (scope, ex, expected) => {
      let params: Parameter[];
      let expectedResult: TypeExpression | undefined = undefined;

      if (expected !== undefined && expected.kind === 'function') {
        if (ex.params.length !== expected.params.length) {
          ex.pos.fail(`Wrong number of arguments, expected function with arguments '${expected.params}' but found ${ex.params.length} arguments`)
        }

        // we can spot check the expected types whenever we don't have them (and only when we need to check)

        expectedResult = expected.result;
        params = ex.params.map((it, index) => {
          const type = it.type === undefined
            ? expected.params[index]!!.type // no type specified, look it up from expected
            : scope.qualifier.checkTypeExpression(it.type);

          return {
            ...it,
            type,
          } satisfies Parameter;
        })
      } else {
        // our lambda had better explicitly declare all of its args or we throw up
        params = ex.params.map(it => {
          if (it.type === undefined) {
            return it.pos.fail('Unable to determine type from context!');
          }

          const type = scope.qualifier.checkTypeExpression(it.type);

          return {
            ...it,
            type,
          } satisfies Parameter;
        })
      }

      // TODO: I'm not sure if 'Nothing' is actually going to work here, make sure to test that
      // TODO: create a system to give annon lambdas names
      const childScope = scope.childFunction(scope.functionScope.symbol.child('<lambda>'), expectedResult ?? this.#coreTypes.nothing);

      for (const param of params) {
        childScope.set(param.name, param.type);
      }

      const body = this.#checkExpression(childScope, ex.body, expectedResult);

      return {
        pos: ex.pos,
        kind: 'function',
        phase: ex.phase,
        params,
        body,
        type: {
          pos: ex.pos,
          kind: 'function',
          phase: ex.phase,
          typeParams: [],
          params: params.map(it => {
            return {
              pos: it.pos,
              phase: it.phase,
              type: it.type,
            }
          }),
          result: body.type,
        } satisfies FunctionType,
      } satisfies Typed<LambdaEx>;
    });
  }

  blockRule(): Rule<BlockEx> {
    return this.#expressionRule<BlockEx>('block', (parentScope, ex, expected) => {
      if (ex.body.length === 0) {
        return {
          pos: ex.pos,
          kind: 'block',
          body: [],
          type: this.#coreTypes.unit,
        }
      }

      const scope = parentScope.child();

      const body: TypedStatement<Statement>[] = ex.body.map(state => {
        switch (state.kind) {
          case "assignment": {
            const expectedType = state.type === undefined ? undefined : scope.qualifier.checkTypeExpression(state.type);
            const expression = this.#checkExpression(scope, state.expression, expectedType);

            if (expectedType !== undefined && !this.#checkAssignable(expression.type, expectedType)) {
              state.expression.pos.fail(`Expected type '${expectedType}' but found type '${expression.type}'`);
            }

            const type = expectedType ?? expression.type;

            scope.set(state.name, type);

            return {
              pos: state.pos,
              kind: 'assignment',
              phase: state.phase,
              name: state.name,
              expression,
              type,
            } satisfies TypedStatement<AssignmentStatement>;
          }
          case 'reassignment': {
            const type = scope.get(state.name, state.pos);

            const expression = this.#checkExpression(scope, state.expression, type);

            if (!this.#checkAssignable(expression.type, type)) {
              state.pos.fail(`Expected assignment of type '${type}' but found value of type '${expression.type}'`);
            }

            return {
              pos: state.pos,
              kind: 'reassignment',
              name: state.name,
              expression,
              type,
            } satisfies TypedStatement<ReassignmentStatement>;
          }
          case "expression": {
            const expression = this.#checkExpression(scope, state.expression, undefined);

            return {
              pos: state.pos,
              kind: 'expression',
              expression,
              type: expression.type,
            } satisfies TypedStatement<ExpressionStatement>;
          }
          case "function": {
            const symbol = scope.functionScope.symbol.child(state.name);
            const params = state.params.map(it => {
              if (it.type === undefined) {
                return it.pos.fail('Unable to determine type from context!');
              }

              const type = scope.qualifier.checkTypeExpression(it.type);

              return {
                ...it,
                type,
              } satisfies Parameter;
            });

            const resultType = scope.qualifier.checkTypeExpression(state.resultType);

            const childScope = scope.childFunction(symbol, resultType);

            const typeParams = state.typeParams.map(typeParam => {
              return {
                pos: typeParam.pos,
                kind: 'typeParameter',
                name: symbol.child(typeParam.name),
              } satisfies TypeParameterType
            });

            for (const typeParam of typeParams) {
              childScope.set(typeParam.name.name, typeParam);
            }

            for (const param of params) {
              childScope.set(param.name, param.type);
            }

            const body = this.#checkExpression(childScope, state.body, resultType);
            const type = {
              pos: state.pos,
              kind: 'function',
              phase: state.phase,
              typeParams,
              params: params.map(it => {
                return {
                  pos: it.pos,
                  phase: it.phase,
                  type: it.type,
                }
              }),
              result: resultType,
            } satisfies FunctionType;

            scope.set(state.name, type);

            return {
              pos: state.pos,
              kind: 'function',
              phase: state.phase,
              name: state.name,
              typeParams,
              params,
              resultType,
              body,
              type,
            } satisfies TypedStatement<FunctionStatement>;
          }
        }
      });

      return {
        pos: ex.pos,
        kind: 'block',
        body,
        type: this.#mergeTypes(body[body.length - 1]!!.type, scope.functionScope.resultType),
      } satisfies Typed<BlockEx>;
    });
  }

  returnRule(): Rule<ReturnEx> {
    return this.#expressionRule<ReturnEx>('return', (scope, ex) => {
      const expression = this.#checkExpression(scope, ex.expression, scope.functionScope.resultType);

      // check that expression is valid with scope result type, update scope result type if needed
      scope.functionScope.resultType = this.#mergeTypes(expression.type, scope.functionScope.resultType);

      return {
        pos: ex.pos,
        kind: 'return',
        expression,
        type: this.#coreTypes.nothing, // return always evaluates to nothing
      } satisfies Typed<ReturnEx>;
    });
  }

  listExpectingNoneRule(): Rule<ListLiteralEx> {
    return this.#expressionRuleExpectNone<ListLiteralEx>('list', (scope, list) => {
      const values = list.values.map(item => this.#checkExpression(scope, item, undefined));
      const type = this.#mergeList(values.map(it => it.type), this.#coreTypes.nothing);

      return {
        ...list,
        values,
        type: this.#coreTypes.listOf(type),
      }
    })
  }

  listExpectingSomeRule(): Rule<ListLiteralEx> {
    return this.#expressionRuleExpectGenericType<ListLiteralEx>('list', this.#coreTypes.list, (scope, list, expected) => {
      const values = list.values.map(item => this.#checkExpression(scope, item, expected.args[0]));
      const type = this.#mergeList(values.map(it => it.type), expected.args[0]!!);

      return {
        ...list,
        values,
        type: this.#coreTypes.listOf(type),
      }
    })
  }

  setExpectingNoneRule(): Rule<SetLiteralEx> {
    return this.#expressionRuleExpectNone<SetLiteralEx>('set', (scope, set) => {
      const values = set.values.map(item => this.#checkExpression(scope, item, undefined));
      const type = this.#mergeList(values.map(it => it.type), this.#coreTypes.nothing);

      return {
        ...set,
        values,
        type: this.#coreTypes.setOf(type),
      }
    })
  }

  setExpectingSomeRule(): Rule<SetLiteralEx> {
    return this.#expressionRuleExpectGenericType<SetLiteralEx>('set', this.#coreTypes.set, (scope, set, expected) => {
      const values = set.values.map(item => this.#checkExpression(scope, item, expected.args[0]));
      const type = this.#mergeList(values.map(it => it.type), expected.args[0]!!);

      return {
        ...set,
        values,
        type: this.#coreTypes.setOf(type),
      }
    })
  }

  mapExpectingNoneRule(): Rule<MapLiteralEx> {
    return this.#expressionRuleExpectNone<MapLiteralEx>('map', (scope, map) => {
      const entries = map.values.map(item => {
        return {
          key: this.#checkExpression(scope, item.key, undefined),
          value: this.#checkExpression(scope, item.value, undefined)
        }
      });
      const keyType = this.#mergeList(entries.map(it => it.key.type), this.#coreTypes.nothing);
      const valueType = this.#mergeList(entries.map(it => it.value.type), this.#coreTypes.nothing);

      return {
        ...map,
        values: entries,
        type: this.#coreTypes.mapOf(keyType, valueType),
      };
    })
  }

  mapExpectingSomeRule(): Rule<MapLiteralEx> {
    return this.#expressionRuleExpectGenericType<MapLiteralEx>('map', this.#coreTypes.set, (scope, map, expected) => {
      const entries = map.values.map(item => {
        return {
          key: this.#checkExpression(scope, item.key, expected.args[0]),
          value: this.#checkExpression(scope, item.value, expected.args[1])
        }
      });
      const keyType = this.#mergeList(entries.map(it => it.key.type), expected.args[0]!!);
      const valueType = this.#mergeList(entries.map(it => it.value.type), expected.args[1]!!);

      return {
        ...map,
        values: entries,
        type: this.#coreTypes.mapOf(keyType, valueType),
      };
    })
  }

  #literalRule<Expr extends Expression>(kind: Expr['kind'], type: NominalType): Rule<Expr> {
    return this.#expressionRule(kind, (_scope, ex, _expected) => {
      return {
        ...ex,
        type,
        // we know that literals don't have sub-expressions by definition
      } as Typed<Expr>;
    })
  }

  #expressionRule<Expr extends Expression>(kind: Expr['kind'], type: (scope: Scope, ex: Expr, expected: TypeExpression | undefined) => Typed<Expr>): Rule<Expr> {
    return {
      test(ex: Expression, _expected: TypeExpression | undefined): ex is Expr {
        return ex.kind === kind;
      },
      type,
    }
  }

  #expressionRuleExpectNone<Expr extends Expression>(kind: Expr['kind'], type: (scope: Scope, ex: Expr) => Typed<Expr>): Rule<Expr> {
    return {
      test(ex: Expression, expected: TypeExpression | undefined): ex is Expr {
        return ex.kind === kind && expected === undefined;
      },
      type,
    }
  }

  #expressionRuleExpectGenericType<Expr extends Expression>(kind: Expr['kind'], expectBase: NominalType, type: (scope: Scope, ex: Expr, expected: ParameterizedType) => Typed<Expr>): Rule<Expr> {
    return {
      test(ex: Expression, expected: TypeExpression | undefined): ex is Expr {
        return ex.kind === kind && expected !== undefined && expected.kind === 'parameterized' && expected.base.name.equals(expectBase.name);
      },
      type,
    }
  }

  #genericsOfEnum(ex: EnumTypeVariant): TypeParameterType[] {
    const base = this.#declarations.get(ex.name.package)?.get(ex.name.parent()!!);

    if (base?.type?.kind === 'enum') {
      return base.type.typeParams;
    } else {
      return ex.pos.fail("Expected enum type but didn't find it.");
    }
  }

  #applyGenerics(expected: TypeExpression, actual: TypeExpression, expectedGenerics: Set<Symbol>): List<{ symbol:  Symbol, type: TypeExpression}> {
    const generics = List<{ symbol:  Symbol, type: TypeExpression}>().asMutable();

    function inner(expected: TypeExpression | undefined, actual: TypeExpression | undefined): void {
      if (expected === undefined || actual === undefined) {
        return;
      }

      switch (expected.kind) {
        case 'typeParameter':
          if (expectedGenerics.has(expected.name)) {
            generics.push({symbol: expected.name, type: actual});
          }
          break;
        case 'parameterized':
          if (actual.kind === 'parameterized') {
            zip(expected.args, actual.args).forEach(args => inner(...args));
          }
          break;
        case 'function':
          if (actual.kind === 'function') {
            zip(expected.params, actual.params).forEach(args => inner(args[0].type, args[1].type));
            inner(expected.result, actual.result);
          }
          break;
      }
    }

    inner(expected, actual);

    return generics.asImmutable();
  }

  #checkAllAssignable(actual: TypeExpression[], expected: TypeExpression[]): boolean {
    return actual.length === expected.length && zip(actual, expected).every(([left, right]) => this.#checkAssignable(left, right));
  }

  #checkAssignable(actual: TypeExpression, expected: TypeExpression | undefined): boolean {
    if (expected === undefined) {
      return true;
    }

    // special case: 'Nothing' can be assigned to anything
    if (actual.kind === 'nominal' && actual.name.equals(this.#coreTypes.nothing.name)) {
      return true;
    }

    // TODO: when we implement bounds, they'll need to go here
    if (actual.kind === 'typeParameter' || expected.kind === 'typeParameter') {
      return true;
    }

    if (expected.kind === 'module') {
      return actual.kind === 'module' && expected.name.equals(actual.name);
    }

    if (expected.kind === 'function') {
      return actual.kind === 'function' && this.#checkAssignableFunctionTypes(actual, expected);
    }

    if (expected.kind === 'overloadFunction') {
      // this should be impossible, we should never expect an overload
      return false;
    }

    if (expected.kind === 'parameterized') {
      return actual.kind === 'parameterized' && actual.base.name.equals(expected.base.name) && this.#checkAllAssignable(actual.args, expected.args);
    }

    if (expected.kind === 'enum') {
      if (actual.kind === 'enum') {
        return actual.name.equals(expected.name);
      }

      if (actual.kind === 'enumAtom' || actual.kind === 'enumTuple' || actual.kind === 'enumStruct') {
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

    if (expected.kind === 'struct') {
      return actual.kind === 'struct' && expected.name.equals(actual.name);
    }

    if (expected.kind === 'enumStruct') {
      return actual.kind === 'enumStruct' && expected.name.equals(actual.name);
    }

    if (expected.kind === 'enumTuple') {
      return actual.kind === 'enumTuple' && expected.name.equals(actual.name);
    }

    if (expected.kind === 'enumAtom') {
      return actual.kind === 'enumAtom' && expected.name.equals(actual.name);
    }

    if (expected.kind === 'nominal') {
      if (actual.kind === 'nominal') {
        return expected.name.equals(actual.name);
      }

      return false;
    }

    // no matching case
    return false;
  }

  #mergeList(items: TypeExpression[], init: TypeExpression): TypeExpression {
    return items.reduce((sum, next) => this.#mergeTypes(sum, next), init);
  }

  /**
   * Merge these two types. This is used in places like generic functions and collection literals.
   *
   * For example: `[1, 2.3]` contains an int and a float. The final list should correctly count as `float`
   * The other use case is for enum variants
   * TODO: if we have any other polymorphism (aka: type classes), that will have to be handled here too
   *
   * @param left
   * @param right
   * @private
   * @returns undefined if there is no overload
   */
  #mergeTypes(left: TypeExpression, right: TypeExpression): TypeExpression {
    if (typesEqual(left, right)) {
      return left;
    }

    if (left.kind === 'nominal' && left.name.equals(this.#coreTypes.nothing.name)) {
      return right;
    } else if (right.kind === 'nominal' && right.name.equals(this.#coreTypes.nothing.name)) {
      return left;
    } else if (this.#checkAssignable(left, right)) {
      return right;
    } else if (this.#checkAssignable(right, left)) {
      return left;
    } else {
      return right.pos.fail(`Incompatible with other type declared at ${left.pos.describe()}`)
    }
  }

  #checkAssignableFunctionTypes(actual: FunctionType, expected: FunctionType): boolean {
    // results are checked backwards because of contravariance
    return actual.phase === expected.phase && this.#checkAssignable(expected.result, actual.result) && actual.params.length === expected.params.length &&
      // TODO: consider how to compare phases. For now demand they are exactly equal
      zip(actual.params, expected.params).every(([left, right]) => (left.phase ?? 'val') === (right.phase ?? 'val') && this.#checkAssignable(left.type!!, right.type));
  }

  #typeSymbolToTypeExpression(symbol: Symbol, pos: Position): TypeExpression {
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

  #processAccess(type: TypeExpression, id: IdentifierEx): TypeExpression {
    switch (type.kind) {
      case "struct":
      case 'enumStruct':
        return type.fields.get(id.name) ?? id.pos.fail(`Not able to find field ${id.name} on type ${type.name}`);
      case 'enumTuple':
        if (id.name.startsWith('v')) {
          const num = Number.parseInt(id.name.substring(1));

          if (Number.isSafeInteger(num) && num < type.fields.length) {
            return type.fields[num]!!;
          }
        }

        return id.pos.fail('Invalid field of tuple value');
      case "enumAtom":
        return id.pos.fail('Atom type has no fields');
      case 'module':
        return id.pos.fail('Module type has no fields');
      case 'function':
      case "overloadFunction":
        return id.pos.fail('Function type has no fields');
      case 'enum':
        return id.pos.fail('Enum type has no fields');
      case 'typeParameter':
        // TODO: someday we'll have bounds, and when we do this will need to be changed to allow field access to valid bounds
        return id.pos.fail('Unknown type has no fields');
      case 'nominal': {
        const realType = this.#declarations.get(type.name.package)?.get(type.name)?.type;

        if (realType === undefined) {
          // this should not happen, since the verifier should have detected this
          return type.pos.fail('Unable to find type information');
        }

        return this.#processAccess(realType, id);
      }
      case 'parameterized': {
        const realType = this.#declarations.get(type.base.name.package)?.get(type.base.name)?.type;

        if (realType === undefined) {
          // this should not happen, since the verifier should have detected this
          return type.pos.fail('Unable to find type information');
        }

        if (realType.kind === 'struct') {
          // only a struct both has type params and fields, at least right now

          if (realType.typeParams.length !== type.args.length) {
            return type.pos.fail(`Incorrect number of type params. Expected ${realType.typeParams.length} but found ${type.args.length}`);
          }

          const generics = Map(zip(realType.typeParams.map(it => it.name), type.args));
          const field = realType.fields.get(id.name) ?? id.pos.fail(`Not able to find field ${id.name} on type ${realType.name}`);

          return this.#fillGenericTypes(field, generics);
        } else {
          return type.pos.fail("Parameterized type has no fields");
        }
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
   *
   * @param ex
   * @param generics
   * @private
   */
  #fillGenericTypes(ex: TypeExpression, generics: Map<Symbol, TypeExpression>): TypeExpression {
    const self = this;

    function fill(ex: TypeExpression): TypeExpression {
      switch (ex.kind) {
        case "struct":
          return {
            ...ex,
            fields: ex.fields.map(fill),
          } satisfies StructType;
        case 'enumStruct':
          return {
            ...ex,
            fields: ex.fields.map(fill),
          } satisfies EnumTypeStructVariant;
        case 'enumTuple':
          return {
            ...ex,
            fields: ex.fields.map(fill),
          } satisfies EnumTypeTupleVariant;
        case 'enumAtom':
        case "module":
          return ex;
        case 'enum':
          return {
            ...ex,
            variants: ex.variants.map(fill) as Map<string, EnumTypeVariant>,
          } satisfies EnumType;
        case 'function':
          return {
            ...ex,
            params: ex.params.map(it => {
              return {
                ...it,
                type: fill(it.type),
              } satisfies FunctionTypeParameter
            })
          } satisfies FunctionType;
        case 'overloadFunction':
          return {
            ...ex,
            branches: ex.branches.map(fill) as FunctionType[],
          } satisfies OverloadFunctionType;
        case "parameterized":
          return {
            ...ex,
            args: ex.args.map(fill),
          } satisfies ParameterizedType;
        case 'nominal':
          const realType = self.#declarations.get(ex.name.package)?.get(ex.name)?.type;

          if (realType === undefined) {
            // this should not happen, since the verifier should have detected this
            return ex.pos.fail('Unable to find type information');
          }

          return ex;
        case 'typeParameter':
          // the magic happens here
          return generics.get(ex.name) ?? ex.pos.fail(`Unable to find generic type parameter with name ${ex.name}`);
      }
    }

    return fill(ex);
  }

}

class FunctionScope {

  constructor(readonly symbol: Symbol, public resultType: TypeExpression) {
  }


}

export class Scope {
  readonly #parent: Scope | undefined;
  readonly #symbols: Map<string, TypeExpression>;
  readonly qualifier: Qualifier;
  readonly functionScope: FunctionScope;

  private constructor(parent: Scope | undefined, declared: Map<string, TypeExpression> | undefined, qualifier: Qualifier, functionScope: FunctionScope) {
    this.#parent = parent;
    this.#symbols = (declared ?? Map<string, TypeExpression>()).asMutable();
    this.qualifier = qualifier;
    this.functionScope = functionScope;
  }

  static init(declared: Map<string, TypeExpression>, qualifier: Qualifier, symbol: Symbol, resultType: TypeExpression): Scope {
    return new Scope(undefined, declared, qualifier, new FunctionScope(symbol, resultType));
  }

  child(): Scope {
    return new Scope(this, undefined, this.qualifier, this.functionScope);
  }

  childFunction(symbol: Symbol, resultType: TypeExpression): Scope {
    return new Scope(this, undefined, this.qualifier, new FunctionScope(symbol, resultType));
  }

  get(name: string, pos: Position): TypeExpression {
    const maybe = this.#symbols.get(name);

    if (maybe !== undefined) {
      return maybe;
    }

    if (this.#parent !== undefined) {
      return this.#parent.get(name, pos);
    }

    return pos.fail(`Could not find '${name}' in scope`);
  }

  set(name: string, type: TypeExpression): void {
    this.#symbols.set(name, type);
  }
}

export interface Rule<Ex extends Expression> {
  test(ex: Expression, expected: TypeExpression | undefined): ex is Ex;

  type(scope: Scope, ex: Ex, expected: TypeExpression | undefined): Typed<Ex>;
}
