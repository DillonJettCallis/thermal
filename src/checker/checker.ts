import {
  type DependencyManager,
  type ExpressionPhase,
  type FunctionPhase,
  PhaseType,
  Position,
  type Symbol,
  TypeDictionary
} from '../ast.ts';
import { List, Map, Seq, Set } from 'immutable';
import { collectDeclarations, Qualifier } from './collector.ts';
import type { CoreTypes } from '../lib.ts';
import {
  CheckedAccessEx,
  type CheckedAccessRecord,
  CheckedAndEx,
  CheckedAssignmentStatement,
  CheckedAtom,
  CheckedAtomType,
  CheckedBlockEx,
  CheckedBooleanLiteralEx,
  CheckedCallEx,
  CheckedConstantDeclare,
  CheckedConstructEntry,
  CheckedConstructEx,
  CheckedDataDeclare,
  type CheckedDataLayout,
  type CheckedDataLayoutType,
  CheckedEnumDeclare,
  CheckedEnumType,
  type CheckedExpression,
  CheckedExpressionStatement,
  CheckedFile,
  CheckedFloatLiteralEx,
  CheckedFunctionDeclare,
  CheckedFunctionStatement,
  CheckedFunctionType,
  CheckedFunctionTypeParameter,
  CheckedIdentifierEx,
  CheckedIfEx,
  CheckedImplDeclare,
  CheckedImportDeclaration,
  type CheckedImportExpression,
  CheckedIntLiteralEx,
  CheckedIsEx,
  CheckedLambdaEx,
  CheckedListLiteralEx,
  CheckedMapLiteralEntry,
  CheckedMapLiteralEx,
  CheckedModuleType,
  CheckedNestedImportExpression,
  CheckedNominalImportExpression,
  CheckedNominalType,
  CheckedNoOpEx,
  CheckedNotEx,
  CheckedOrEx,
  CheckedParameter,
  CheckedParameterizedType,
  CheckedProtocolDeclare,
  CheckedProtocolType,
  CheckedReassignmentStatement,
  CheckedReturnEx,
  type CheckedSetLiteralEx,
  type CheckedStatement,
  CheckedStaticReferenceEx,
  CheckedStringLiteralEx,
  CheckedStruct,
  CheckedStructField,
  CheckedStructType,
  CheckedTuple,
  CheckedTupleType,
  type CheckedTypeExpression,
  CheckedTypeParameterType
} from './checkerAst.ts';
import {
  ParserAccessEx,
  ParserAndEx,
  ParserAssignmentStatement,
  ParserAtom,
  ParserBlockEx,
  ParserBooleanLiteralEx,
  ParserCallEx,
  ParserConstantDeclare,
  ParserConstructEx,
  ParserDataDeclare,
  type ParserDataLayout,
  ParserEnumDeclare,
  type ParserExpression,
  ParserExpressionStatement,
  type ParserFile,
  ParserFloatLiteralEx,
  type ParserFunction,
  ParserFunctionDeclare,
  type ParserFunctionStatement,
  ParserIdentifierEx,
  ParserIfEx,
  ParserImportDeclaration,
  type ParserImportExpression,
  ParserIntLiteralEx,
  ParserIsEx,
  ParserLambdaEx,
  ParserListLiteralEx,
  type ParserMapLiteralEx,
  ParserNominalImportExpression,
  ParserNoOpEx,
  ParserNotEx,
  ParserOrEx,
  type ParserParameter,
  ParserProtocolDeclare,
  ParserReassignmentStatement,
  ParserReturnEx,
  ParserSetLiteralEx,
  type ParserStatement,
  ParserStaticAccessEx,
  ParserStaticReferenceEx,
  ParserStringLiteralEx,
  ParserStruct,
  ParserTuple,
  type ParserTypeExpression,
  ParserTypeParameterType
} from '../parser/parserAst.ts';
import { checkImport } from './verifier.ts';
import { scan } from '../utils.ts';

export class Checker {
  readonly #manager: DependencyManager;
  readonly #typeDict: TypeDictionary;
  readonly #coreTypes: CoreTypes;
  readonly #preamble: Map<string, Symbol>;

  constructor(manager: DependencyManager, typeDict: TypeDictionary, coreTypes: CoreTypes, preamble: Map<string, Symbol>) {
    this.#manager = manager;
    this.#typeDict = typeDict;
    this.#coreTypes = coreTypes;
    this.#preamble = preamble;
  }

  checkFile(file: ParserFile): CheckedFile {
    const declarations = collectDeclarations(file, this.#manager, this.#preamble);
    const filePos = new Position(file.src, 0, 0);
    const qualifier = new Qualifier(declarations);
    const protocols = declarations.valueSeq().filter(it => this.#typeDict.isProtocol(it)).toSet();
    const fileScope = Scope.init(declarations.map(symbol => this.#typeSymbolToPhaseType(symbol, filePos)), protocols, qualifier, file.module, this.#coreTypes.unit);

    const checkedDeclarations = file.declarations.map(dec => {
      if (dec instanceof ParserImportDeclaration) {
        return new CheckedImportDeclaration({
          pos: dec.pos,
          package: dec.package,
          ex: this.#checkImportExpression(dec.ex),
        });
      } else if (dec instanceof ParserFunctionDeclare) {
        return this.#checkFuncDeclare(dec, fileScope, file.module);
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
          external: dec.external,
          expression,
          type,
        });
      } else if (dec instanceof ParserDataDeclare) {
        const typeParams = dec.typeParams.map(it => fileScope.qualifier.checkTypeParamType(dec.symbol, it) as CheckedTypeParameterType);

        return new CheckedDataDeclare({
          pos: dec.pos,
          name: dec.name,
          symbol: dec.symbol,
          external: dec.external,
          access: dec.access,
          typeParams,
          layout: this.#checkDataLayout(dec.layout, dec.typeParams, fileScope),
        });
      } else if (dec instanceof ParserEnumDeclare) {
        const typeParams = dec.typeParams.map(it => fileScope.qualifier.checkTypeParamType(dec.symbol, it));
        const variants = dec.variants.map(variant => this.#checkDataLayout(variant, dec.typeParams, fileScope));

        return new CheckedEnumDeclare({
          pos: dec.pos,
          name: dec.name,
          symbol: dec.symbol,
          external: dec.external,
          access: dec.access,
          typeParams,
          variants,
        });
      } else if (dec instanceof ParserProtocolDeclare) {
        const protoScope = fileScope.childSelf(dec.symbol, dec.typeParams);

        return new CheckedProtocolDeclare({
          pos: dec.pos,
          name: dec.name,
          symbol: dec.symbol,
          typeParams: dec.typeParams.map(it => protoScope.qualifier.checkTypeParamType(dec.symbol, it)),
          methods: dec.methods.map(it => this.#checkFuncDeclare(it, protoScope, file.module)),
        });
      } else {
        const implScope = fileScope.childSelf(dec.symbol, dec.typeParams);

        return new CheckedImplDeclare({
          pos: dec.pos,
          symbol: dec.symbol,
          base: implScope.qualifier.includeTypeParams(dec.symbol, dec.typeParams).checkConcreteTypeExpression(dec.base),
          protocol: dec.protocol === undefined ? undefined : implScope.qualifier.includeTypeParams(dec.symbol, dec.typeParams).checkConcreteTypeExpression(dec.protocol),
          typeParams: dec.typeParams.map(it => implScope.qualifier.checkTypeParamType(dec.symbol, it)),
          methods: dec.methods.map(it => this.#checkFuncDeclare(it, implScope, file.module)),
        })
      }
    });

    return new CheckedFile({
      src: file.src,
      module: file.module,
      declarations: checkedDeclarations,
    });
  }

  #checkDataLayout(ex: ParserDataLayout, typeParams: List<ParserTypeParameterType>, fileScope: Scope): CheckedDataLayout {
    const scope = fileScope.childFunction(ex.symbol, typeParams, this.#coreTypes.nothing, 'fun');
    const checkedTypeParams = typeParams.map(it => scope.qualifier.checkTypeParamType(ex.symbol, it) as CheckedTypeParameterType);

    if (ex instanceof ParserStruct) {
      return this.#checkStruct(ex, checkedTypeParams, scope);
    } else if (ex instanceof ParserTuple) {
      return this.#checkTuple(ex, checkedTypeParams, scope);
    } else {
      return this.#checkAtom(ex, checkedTypeParams, scope);
    }
  }

  #checkStruct(ex: ParserStruct, typeParams: List<CheckedTypeParameterType>, fileScope: Scope): CheckedStruct {
    const fields = ex.fields.map(it => {
      const type = fileScope.qualifier.checkTypeExpression(it.type);

      return new CheckedStructField({
        pos: it.pos,
        type,
        default: it.default === undefined ? undefined : this.#checkExpression(it.default, fileScope, type),
      });
    });

    return new CheckedStruct({
      pos: ex.pos,
      symbol: ex.symbol,
      typeParams,
      fields,
      enum: ex.enum,
    });
  }

  #checkTuple(ex: ParserTuple, typeParams: List<CheckedTypeParameterType>, fileScope: Scope): CheckedTuple {
    return new CheckedTuple({
      pos: ex.pos,
      symbol: ex.symbol,
      typeParams,
      fields: ex.fields.map(it => fileScope.qualifier.checkTypeExpression(it)),
      enum: ex.enum,
    });
  }

  #checkAtom(ex: ParserAtom, typeParams: List<CheckedTypeParameterType>, _fileScope: Scope): CheckedAtom {
    return new CheckedAtom({
      pos: ex.pos,
      symbol: ex.symbol,
      typeParams,
      enum: ex.enum,
    });
  }

  #checkFuncDeclare(dec: ParserFunctionDeclare, fileScope: Scope, module: Symbol): CheckedFunctionDeclare {
    const state = this.checkFunction(dec, fileScope, module);

    return new CheckedFunctionDeclare({
      pos: dec.pos,
      name: dec.name,
      functionPhase: dec.functionPhase,
      access: dec.access,
      external: dec.external,
      symbol: dec.symbol,
      ...state,
    });
  }

  #checkImportExpression(ex: ParserImportExpression): CheckedImportExpression {
    if (ex instanceof ParserNominalImportExpression) {
      return new CheckedNominalImportExpression({
        pos: ex.pos,
        name: ex.name,
      });
    } else {
      return new CheckedNestedImportExpression({
        pos: ex.pos,
        base: ex.base,
        children: ex.children.map(it => this.#checkImportExpression(it)),
      })
    }
  }

  #checkExpression(ex: ParserExpression, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedExpression {
    if (ex instanceof ParserNoOpEx) {
      return new CheckedNoOpEx({
        pos: ex.pos,
        type: this.#coreTypes.nothing,
        phase: 'const',
      });
    } else if (ex instanceof ParserBooleanLiteralEx) {
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
    } else if (ex instanceof ParserStaticReferenceEx) {
      return this.checkStaticReference(ex, scope);
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
    const check = this.#checkExpression(ex.check, scope, undefined);

    return new CheckedIsEx({
      pos: ex.pos,
      not: ex.not,
      base,
      check,
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

  checkStaticAccess(ex: ParserStaticAccessEx, scope: Scope): CheckedStaticReferenceEx {
    const first = ex.path.first()!;
    const rest = ex.path.shift();

    const init = this.checkIdentifier(first!, scope);
    const path = List.of(init).asMutable();
    let prev = init.type;
    let prevName: Symbol | undefined;

    for (const next of rest) {
      if (prev instanceof CheckedModuleType) {
        const childName = prev.name.child(next.name);

        const child = this.#typeDict.lookupSymbol(childName) ?? next.pos.fail(`No such import found ${childName}`);
        path.push(new CheckedIdentifierEx({
          pos: next.pos,
          name: next.name,
          type: child.type,
          phase: 'const',
        }));
        prev = child.type;
        prevName = childName;
      } else if (prev instanceof CheckedEnumType) {
        const variant = prev.variants.get(next.name) ?? next.pos.fail(`No such enum variant found ${next.name}`);
        path.push(new CheckedIdentifierEx({
          pos: next.pos,
          name: next.name,
          type: variant,
          phase: 'const',
        }));
        prev = variant;
        prevName = variant.name;
      } else if (prev instanceof CheckedStructType) {
        const childName = prev.name.child(next.name);

        const child = this.#typeDict.lookupSymbol(childName) ?? next.pos.fail(`No such import found ${childName}`);
        path.push(new CheckedIdentifierEx({
          pos: next.pos,
          name: next.name,
          type: child.type,
          phase: 'const',
        }));
        prev = child.type;
        prevName = childName;
      } else if (prev instanceof CheckedProtocolType) {
        const childName = prev.name.child(next.name);

        const child = this.#typeDict.lookupSymbol(childName) ?? next.pos.fail(`No such import found ${childName}`);
        path.push(new CheckedIdentifierEx({
          pos: next.pos,
          name: next.name,
          type: child.type,
          phase: 'const',
        }));
        prev = child.type;
        prevName = childName;
      } else {
        return next.pos.fail('No static members found');
      }
    }

    if (prevName === undefined) {
      return ex.pos.fail('How is there a static access with only one name?');
    }

    const module = this.#typeDict.lookupModule(prevName);

    if (module === undefined) {
      return ex.pos.fail(`Could not find module of ${prevName}`);
    }

    return new CheckedStaticReferenceEx({
      pos: ex.pos,
      type: prev,
      phase: 'const',
      symbol: prevName,
      module,
    });
  }

  checkStaticReference(ex: ParserStaticReferenceEx, scope: Scope): CheckedStaticReferenceEx {
    const access = this.#typeDict.lookupSymbol(ex.symbol) ?? ex.pos.fail('Unable to find a static symbol.');

    return new CheckedStaticReferenceEx({
      pos: ex.pos,
      symbol: ex.symbol,
      module: access.module,
      type: access.type,
      phase: 'const',
    })
  }

  checkConstruct(ex: ParserConstructEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedConstructEx {
    const base = this.#checkExpression(ex.base, scope, undefined);
    const baseType = base.type;

    if (baseType instanceof CheckedStructType) {
      // TODO: I forgot to handle default values inside of struct types
      // for now, let's just ignore defaults and we'll handle it some other time
      const expectedKeys = baseType.fields.keySeq().toSet();
      const actualKeys = Seq(ex.fields).map(it => it.name).toSet();
      // TODO: check for duplicated fields

      if (expectedKeys.equals(actualKeys)) {
        const actualFields = ex.fields.toOrderedMap().mapKeys((_, it) => it.name);

        // TODO: constructors can't explicitly declare generics, but they should be able to
        // now we need to confirm that the given expressions match the type we started with
        const genericParams = baseType.typeParams;
        const namesToPairs = actualFields.map((constructEntry, name) => {
          const expected = baseType.fields.get(name) ?? ex.pos.fail('This should not happen. A constructor is missing a required field after it was already checked');
          return {
            actual: constructEntry.value,
            expected,
          };
        });

        const { typeArgs, args } = this.#fullChecking(namesToPairs, scope, ex.pos, genericParams, ex.typeArgs);

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
          phase: this.#phaseCheck(args.valueSeq().toList(), scope),
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

  /**
   * If this is a method, return that checked call, otherwise return undefined to indicate that function checking needs to continue
   */
  #checkMethod(ex: ParserCallEx, scope: Scope): CheckedCallEx | undefined {
    if (ex.func instanceof ParserAccessEx) {
      const checkBase = this.#checkExpression(ex.func.base, scope, undefined);
      const maybeMethod = this.#processMethod(checkBase.type, ex.func.field, scope.protocols());

      if (maybeMethod === undefined) {
        return undefined;
      }

      // the method exists, but you don't have access. Pretend like the method does not exist
      if (!checkImport(maybeMethod.access, scope.functionScope.module, maybeMethod.module)) {
        return undefined;
      }

      const funcType = maybeMethod.type as CheckedFunctionType;
      const func = new CheckedStaticReferenceEx({
        pos: ex.func.pos,
        symbol: maybeMethod.name,
        module: maybeMethod.module,
        type: maybeMethod.type,
        phase: 'const',
      });

      // put the base as the first argument
      const inputArgs = ex.args.unshift(ex.func.base);

      // TODO: Merge this with function handling
      // TODO: handle default arguments
      // TODO: handle generics in the expected type, that matters
      if (funcType.params.size === inputArgs.size) {
        const rawArgs = funcType.params.zipWith((expected: CheckedFunctionTypeParameter, actual: ParserExpression) => ({expected: expected.type, actual}), inputArgs).toOrderedMap();

        const { typeArgs, args } = this.#fullChecking(rawArgs, scope, ex.pos, funcType.typeParams, ex.typeArgs);
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
          args: inputArgs.map((_, index) => args.get(index) ?? ex.pos.fail("This should never happen, `fullChecking` didn't return an argument")),
          typeArgs,
          type: this.#fillGenericTypes(funcType.result, ex.pos, typeParams),
          phase: this.#phaseCheckCall(phaseParams, funcType.phase, scope),
        });
      } else {
        return ex.pos.fail(`Function ${func.pos} expects ${funcType.params.size} arguments but found ${inputArgs.size} arguments instead`);
      }
    } else {
      return undefined;
    }
  }

  checkCall(ex: ParserCallEx, scope: Scope): CheckedCallEx {
    const maybeMethod = this.#checkMethod(ex, scope);

    if (maybeMethod !== undefined) {
      // this is a method, all checking has already been done
      return maybeMethod;
    }

    const func = this.#checkExpression(ex.func, scope, undefined);
    const funcType = func.type;

    if (funcType instanceof CheckedFunctionType) {
      // TODO: this is a special case for equality, we should do something better here
      if (func instanceof CheckedIdentifierEx && (func.name === '==' || func.name === '!=')) {
        const resolvedFields = ex.args.map(it => this.#checkExpression(it, scope, undefined));

        if (resolvedFields.size !== 2) {
          func.pos.fail(`Something is wrong here, an '==' or '!=' function has more or less than two arguments? What?`)
        }

        const left = resolvedFields.get(0)!;
        const right = resolvedFields.get(1)!;

        const leftType = left.type;
        const rightType = right.type;

        // all we do is confirm that the types are in theory compatible, the real equals method will do the runtime checking
        if (this.#checkAssignable(leftType, rightType) || this.#checkAssignable(rightType, leftType)) {
          return new CheckedCallEx({
            pos: ex.pos,
            func,
            args: resolvedFields,
            typeArgs: List(),
            type: funcType.result,
            // == and != are always `fun`
            phase: this.#phaseCheckCall(resolvedFields.map(arg => ({arg, expectedPhase: undefined})), 'fun', scope),
          });
        } else {
          func.pos.fail(`Impossible ${func.name}. Types ${leftType} and ${rightType} will never ever overlap and cannot be equal`);
        }
      }

      // TODO: handle default arguments
      // TODO: handle generics in the expected type, that matters
      if (funcType.params.size === ex.args.size) {
        const rawArgs = funcType.params.zipWith((expected: CheckedFunctionTypeParameter, actual: ParserExpression) => ({expected: expected.type, actual}), ex.args).toOrderedMap();

        const { typeArgs, args } = this.#fullChecking(rawArgs, scope, ex.pos, funcType.typeParams, ex.typeArgs);
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
          phase: this.#phaseCheckCall(phaseParams, funcType.phase, scope),
        });
      } else {
        return ex.pos.fail(`Function ${func.pos} expects ${funcType.params.size} arguments but found ${ex.args.size} arguments instead`);
      }
    } else if (funcType instanceof CheckedTupleType) {
      // this is a copy of the function checking code, slightly tweaked
      // TODO: handle default arguments
      // TODO: handle generics in the expected type, that matters
      if (funcType.fields.size === ex.args.size) {
        const genericParams = funcType.typeParams;
        const rawArgs = funcType.fields.zipWith((expected, actual: ParserExpression) => ({expected, actual}), ex.args).toOrderedMap();

        const { typeArgs, args } = this.#fullChecking(rawArgs, scope, ex.pos, genericParams, ex.typeArgs);
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
          phase: this.#phaseCheckCall(args.valueSeq().map(arg => ({arg, expectedPhase: undefined})).toList(), 'fun', scope),
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
      phase: this.#phaseCheck(List.of(left, right), scope),
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
      phase: this.#phaseCheck(List.of(left, right), scope),
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
      phase: this.#phaseCheck(List.of(base), scope, 'fun'),
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
      phase: this.#phaseCheck(exprs.asImmutable(), scope),
    });
  }

  #checkLambdaBody(ex: ParserLambdaEx, scope: Scope, params: List<CheckedParameter>, expectedResult: CheckedTypeExpression | undefined): { phase: ExpressionPhase, body: CheckedExpression, result: CheckedTypeExpression, closures: Map<string, PhaseType> } {
    // TODO: I'm not sure if 'Nothing' is actually going to work here, make sure to test that
    // TODO: create a system to give annon lambdas names
    const childScope = scope.childFunction(scope.functionScope.symbol.child('<lambda>'), List(), expectedResult ?? this.#coreTypes.nothing, ex.functionPhase);

    for (const param of params) {
      childScope.set(param.name, new PhaseType(param.type, param.phase ?? 'val', param.pos));
    }

    const body = this.#checkExpression(ex.body, childScope, expectedResult);
    const closures = childScope.functionScope.closures;
    const phase = this.#phaseCheckImpl(closures.valueSeq().map(it => ({pos: it.pos, phase: it.phase, expectedPhase: undefined})).toList(), ex.functionPhase, scope);
    const result = this.#mergeTypes(body.type, childScope.functionScope.resultType, ex.pos);

    return {
      phase,
      body,
      result,
      closures,
    };
  }

  #handleLambdaExpectedType(pos: Position, scope: Scope, actualParams: List<ParserParameter>, expected: CheckedTypeExpression | undefined): { params: List<CheckedParameter>, expectedResult: CheckedTypeExpression | undefined } {
    if (expected instanceof CheckedFunctionType) {
      if (actualParams.size !== expected.params.size) {
        return pos.fail(`Wrong number of arguments, expected function with arguments '${expected.params}' but found ${actualParams.size} arguments`);
      }

      const expectedResult = expected.result;
      const params = actualParams.map((it, index) => {
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

      return { params, expectedResult };
    } else {
      const params = actualParams.map(it => {
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

      return { params, expectedResult: undefined };
    }
  }

  checkLambda(ex: ParserLambdaEx, scope: Scope, expected: CheckedTypeExpression | undefined): CheckedLambdaEx {
    const { params, expectedResult } = this.#handleLambdaExpectedType(ex.pos, scope, ex.params, expected);
    const { phase, body, result, closures } = this.#checkLambdaBody(ex, scope, params, expectedResult);

    return new CheckedLambdaEx({
      pos: ex.pos,
      params,
      phase,
      functionPhase: ex.functionPhase,
      body,
      closures,
      type: new CheckedFunctionType({
        phase: ex.functionPhase,
        typeParams: List(),
        params: params.map(it => {
          return new CheckedFunctionTypeParameter({
            phase: it.phase,
            type: it.type,
          });
        }),
        result,
      }),
    })
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
    const initBody: List<CheckedStatement> = ex.body.pop().map(state => this.checkStatement(state, scope, undefined));
    // the last statement is the only one that gets expected, and the only one who's type matters
    const last = this.checkStatement(ex.body.last()!, scope, expected);
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

    const first = state.name.first()!;
    const id = scope.get(first.name, state.pos);

    if (id.phase !== 'var') {
      return state.pos.fail(`Attempt to update a '${id.phase}'. Only a 'var' can be updated`);
    }

    const [finalType, names] = scan(state.name.shift(), id.type, (base, next) => {
      const type = this.#processAccess(base, next);

      return [type, new CheckedIdentifierEx({ pos: next.pos, phase: 'var', name: next.name, type })] as const
    });

    const expression = this.#checkExpression(state.expression, scope, finalType);

    if (!this.#checkAssignable(expression.type, finalType)) {
      state.pos.fail(`Expected assignment of type '${finalType}' but found value of type '${expression.type}'`);
    }

    return new CheckedReassignmentStatement({
      pos: state.pos,
      name: names.unshift(new CheckedIdentifierEx({ pos: first.pos, name: first.name, phase: 'var', type: id.type })),
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

  #checkFunctionSignature(state: { typeParams: List<ParserTypeParameterType>, params: List<ParserParameter>, functionPhase: FunctionPhase, result: ParserTypeExpression }, scope: Scope, symbol: Symbol): { typeParams: List<CheckedTypeParameterType>, params: List<CheckedParameter>, result: CheckedTypeExpression } {
    const qualifier = scope.qualifier.includeTypeParams(symbol, state.typeParams);

    // TODO: use the lambda expression checker internally to cut down on duplicated logic
    const typeParams = state.typeParams.map(typeParam => {
      return new CheckedTypeParameterType({
        name: symbol.child(typeParam.name),
      });
    });

    const params = state.params.map(it => {
      if (it.type === undefined) {
        return it.pos.fail('Unable to determine type from context!');
      }

      const type = qualifier.checkTypeExpression(it.type);

      return new CheckedParameter({
        pos: it.pos,
        phase: it.phase,
        name: it.name,
        type,
      });
    });

    switch (state.functionPhase) {
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

    const result = qualifier.checkTypeExpression(state.result);

    return { typeParams, params, result };
  }

  checkFunction(state: ParserFunction, scope: Scope, parent: Symbol): {
    params: List<CheckedParameter>,
    body: CheckedExpression,
    typeParams: List<CheckedTypeParameterType>,
    type: CheckedFunctionType,
    result: CheckedTypeExpression,
  } {
    const symbol = parent.child(state.name);

    const statePhase = state instanceof ParserFunctionDeclare ? 'const' : state.phase;
    const { typeParams, params, result } = this.#checkFunctionSignature({
      typeParams: state.typeParams,
      params: state.params,
      result: state.result,
      functionPhase: state.functionPhase,
    }, scope, symbol);

    const childScope = scope.childFunction(symbol, state.typeParams, result, state.functionPhase);

    for (const typeParam of typeParams) {
      childScope.set(typeParam.name.name, new PhaseType(typeParam, 'val', state.pos));
    }

    for (const param of params) {
      childScope.set(param.name, new PhaseType(param.type, param.phase ?? 'val', param.pos));
    }

    const body = this.#checkExpression(state.body, childScope, result);
    const closures = childScope.functionScope.closures;
    const phase = this.#phaseCheckImpl(closures.valueSeq().map(it => ({pos: it.pos, phase: it.phase, expectedPhase: undefined})).toList(), 'fun', scope);

    if (statePhase !== phase) {
      state.pos.fail(`Attempt to declare '${statePhase}' function, but body is actually '${phase}'. This function must close over values outside of the allowed phase.`);
    }

    const type = new CheckedFunctionType({
      phase: state.functionPhase,
      typeParams,
      params: params.map(it => {
        return new CheckedFunctionTypeParameter({
          phase: it.phase,
          type: it.type,
        });
      }),
      result,
    });

    scope.set(state.name, new PhaseType(type, statePhase, state.pos));

    return {
      params,
      body,
      typeParams,
      type,
      result,
    };
  }

  checkFunctionStatement(state: ParserFunctionStatement, scope: Scope, parent: Symbol): CheckedFunctionStatement {
    const base = this.checkFunction(state, scope, parent);

    return new CheckedFunctionStatement({
      pos: state.pos,
      phase: state.phase,
      functionPhase: state.functionPhase,
      name: state.name,
      ...base,
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
      phase: this.#phaseCheck(values, scope),
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
      phase: this.#phaseCheck(values, scope),
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
      phase: this.#phaseCheck(entries.flatMap(it => List.of(it.key, it.value)), scope),
    });
  }

  #lookup(type: CheckedTypeExpression | undefined): CheckedTypeExpression | undefined {
    if (type instanceof CheckedNominalType) {
      return this.#typeDict.lookupSymbol(type.name)?.type;
    } else {
      return type;
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

  #phaseCheck(args: List<CheckedExpression>, scope: Scope, functionPhase: FunctionPhase = 'fun'): ExpressionPhase {
    return this.#phaseCheckImpl(args.map(arg => ({phase: arg.phase, pos: arg.pos, expectedPhase: undefined})), functionPhase, scope);
  }

  #phaseCheckCall(pairs: List<{ arg: CheckedExpression, expectedPhase: ExpressionPhase | undefined }>, functionPhase: FunctionPhase, scope: Scope): ExpressionPhase {
    return this.#phaseCheckImpl(pairs.map(({arg, expectedPhase}) => ({phase: arg.phase, pos: arg.pos, expectedPhase})), functionPhase, scope);
  }

  #phaseCheckImpl(pairs: List<{ phase: ExpressionPhase, expectedPhase: ExpressionPhase | undefined, pos: Position }>, functionPhase: FunctionPhase, scope: Scope): ExpressionPhase {
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
        // if basePhase is const, then we want to return const no matter what
        // if we are inside a sig, calling a fun, then the result is always val (or const) because any flow or var arguments to the fun can be unwrapped before calling the function
        if (highestPhase !== 'const' && scope.functionScope.phase === 'sig') {
          return 'val';
        }

        // a fun returns the highest value
        return highestPhase;
    }
  }

  //TODO: someday have a way to handle default values, meaning optional actual values
  #fullChecking<MapKey extends number | string>(pairs: Map<MapKey, { actual: ParserExpression, expected: CheckedTypeExpression }>, scope: Scope, pos: Position, genericParams: List<CheckedTypeParameterType>, explicitTypeArgs: List<ParserTypeExpression>): { typeArgs: List<CheckedTypeExpression>, args: Map<MapKey, CheckedExpression> } {
    if (genericParams.isEmpty()) {
      if (!explicitTypeArgs.isEmpty()) {
        return pos.fail('Attempt to pass generic arguments to non-generic function');
      }

      return {
        typeArgs: List(),
        args: pairs.map(({actual, expected}) => this.#checkExpression(actual, scope, expected)),
      };
    }

    if (!explicitTypeArgs.isEmpty()) {
      // TODO: for now we'll assume you either have the full list or none. This code only works for a full list, the else block handles the none case

      // only handle an exact match
      if (genericParams.size !== explicitTypeArgs.size) {
        return pos.fail(`Wrong number of generic arguments. Expected: ${genericParams.size} but found ${explicitTypeArgs.size}`);
      }

      const typeArgs: List<CheckedTypeExpression> = explicitTypeArgs.map(it => scope.qualifier.checkTypeExpression(it));
      const actualGenerics: Map<Symbol, CheckedTypeExpression> = (typeArgs.zip(genericParams).toKeyedSeq() as Seq.Keyed<number, [CheckedTypeExpression, CheckedTypeParameterType]>)
        .mapKeys<Symbol>((_, [, param]) => param.name)
        .map(([arg]) => arg)
        .toMap();

      return {
        typeArgs,
        args: pairs.map(({actual, expected}) => {
          const expectedWithGenerics = this.#fillGenericTypes(expected, pos, actualGenerics);

          return this.#checkExpression(actual, scope, expectedWithGenerics);
        }),
      }
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
      args: checkedArgs.asImmutable(),
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
      return this.#checkAssignable(actual.base, expected.base) && this.#checkAllAssignable(actual.args, expected.args);
    }

    if (actual instanceof CheckedNominalType) {
      const tryLookup = this.#lookup(actual);

      if (tryLookup === undefined) {
        return false;
      }

      return this.#checkAssignable(tryLookup, expected);
    }

    if (expected instanceof CheckedNominalType) {
      return this.#checkAssignable(actual, this.#lookup(expected));
    }

    if (expected instanceof CheckedEnumType) {
      if (actual instanceof CheckedStructType || actual instanceof CheckedTupleType || actual instanceof CheckedAtomType) {
        if (actual.enum === undefined) {
          // this null check situation really should never happen
          return false;
        } else {
          // if the enum variant is a sub-type of this enum
          return actual.enum.equals(expected.name);
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
    const record = this.#typeDict.lookupSymbol(symbol);

    if (record === undefined) {
      return pos.fail(`Failed to find '${symbol}'`);
    }

    // TODO: do we need to check access here? In theory it's already been checked ..
    return new PhaseType(record.type, 'const', pos);
  }

  #processAccess(type: CheckedTypeExpression, id: ParserIdentifierEx): CheckedTypeExpression {
    if (type instanceof CheckedStructType) {
      return type.fields.get(id.name) ?? id.pos.fail(`Not able to find field ${id.name} on type ${type.name}`);
    } else if (type instanceof CheckedTupleType) {
      if (id.name.startsWith('v')) {
        const num = Number.parseInt(id.name.substring(1));

        if (Number.isSafeInteger(num) && num < type.fields.size) {
          return type.fields.get(num)!;
        }
      }

      return id.pos.fail('Invalid field of tuple value');
    } else if (type instanceof CheckedAtomType) {
      return id.pos.fail('Atom type has no fields');
    } else if (type instanceof CheckedModuleType) {
      return id.pos.fail('Module type has no fields');
    } else if (type instanceof CheckedProtocolType) {
      // TODO: we want to be able to define properties for protocols someday
      return id.pos.fail('Protocol type has no fields');
    } else if (type instanceof CheckedFunctionType) {
      return id.pos.fail('Function type has no fields');
    } else if (type instanceof CheckedFunctionTypeParameter) {
      return id.pos.fail('Something is wrong, it should be impossible to access this');
    } else if (type instanceof CheckedEnumType) {
      return id.pos.fail('Enum type has no fields');
    } else if (type instanceof CheckedTypeParameterType) {
      // TODO: someday we'll have bounds, and when we do this will need to be changed to allow field access to valid bounds
      return id.pos.fail('Unknown type has no fields');
    } else if (type instanceof CheckedNominalType) {
      const realType = this.#typeDict.lookupSymbol(type.name)?.type;

      if (realType === undefined) {
        // this should not happen, since the verifier should have detected this
        return id.pos.fail('Unable to find type information');
      }

      return this.#processAccess(realType, id);
    } else {
      const realType = this.#typeDict.lookupSymbol(type.base.name)?.type;

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

  #processMethod(type: CheckedTypeExpression, id: ParserIdentifierEx, protocols: Set<Symbol>): CheckedAccessRecord | undefined {
    if (type instanceof CheckedStructType) {
      return this.#typeDict.lookupMethod(type.name, id, protocols);
    } else if (type instanceof CheckedTupleType) {
      return this.#typeDict.lookupMethod(type.name, id, protocols);
    } else if (type instanceof CheckedAtomType) {
      return this.#typeDict.lookupMethod(type.name, id, protocols);
    } else if (type instanceof CheckedModuleType) {
      return undefined;
    } else if (type instanceof CheckedProtocolType) {
      // TODO: this might not work until we have proper bounds
      // this might also never happen, I'm not sure, needs more thought
      return this.#typeDict.lookupMethod(type.name, id, protocols);
    } else if (type instanceof CheckedFunctionType) {
      return undefined;
    } else if (type instanceof CheckedFunctionTypeParameter) {
      return id.pos.fail('Something is wrong, it should be impossible to access this');
    } else if (type instanceof CheckedEnumType) {
      return this.#typeDict.lookupMethod(type.name, id, protocols);
    } else if (type instanceof CheckedTypeParameterType) {
      // TODO: someday we'll have protocols and bounds, and when we do this will need to be changed to allow method access to valid bounds
      return id.pos.fail('Unknown type has no methods');
    } else if (type instanceof CheckedNominalType) {
      const realType = this.#typeDict.lookupSymbol(type.name)?.type;

      if (realType === undefined) {
        // this should not happen, since the verifier should have detected this
        return id.pos.fail('Unable to find type information');
      }

      return this.#processMethod(realType, id, protocols);
    } else {
      const realType = this.#typeDict.lookupSymbol(type.base.name);

      if (realType === undefined) {
        // this should not happen, since the verifier should have detected this
        return id.pos.fail('Unable to find type information');
      }

      if (realType.type instanceof CheckedStructType) {
        // only a struct both has type params and fields, at least right now

        if (realType.type.typeParams.size !== type.args.size) {
          return id.pos.fail(`Incorrect number of type params. Expected ${realType.type.typeParams.size} but found ${type.args.size}`);
        }

        return this.#typeDict.lookupMethod(realType.type.name, id, protocols);
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
    const typeDict = this.#typeDict;

    function fill(ex: CheckedTypeExpression): CheckedTypeExpression {
      if (ex instanceof CheckedStructType) {
        return ex.set('fields', ex.fields.map(fill));
      } else if (ex instanceof CheckedTupleType) {
        return ex.set('fields', ex.fields.map(fill));
      } else if (ex instanceof CheckedAtomType) {
        return ex;
      } else if (ex instanceof CheckedModuleType) {
        return ex;
      } else if (ex instanceof CheckedEnumType) {
        return ex.set('variants', ex.variants.map(fill) as Map<string, CheckedDataLayoutType>);
      } else if (ex instanceof CheckedFunctionType) {
        return ex.set('params', ex.params.map(it => it.set('type', fill(it.type)))).set('result', fill(ex.result));
      } else if (ex instanceof CheckedFunctionTypeParameter) {
        return ex.set('type', fill(ex.type));
      } else if (ex instanceof CheckedParameterizedType) {
        return ex.set('args', ex.args.map(fill));
      } else if (ex instanceof CheckedNominalType) {
        const realType = typeDict.lookupSymbol(ex.name)?.type;

        if (realType === undefined) {
          // this should not happen, since the verifier should have detected this
          return pos.fail('Unable to find type information');
        }

        return ex;
      } else {
        // the magic happens here
        return generics.get(ex.name) ?? ex; // TODO: is this the right action to take?
      }
    }

    return fill(ex);
  }

}

class FunctionScope {

  readonly #closures = Map<string, PhaseType>().asMutable();
  readonly symbol: Symbol;
  readonly module: Symbol;
  readonly phase: FunctionPhase;
  resultType: CheckedTypeExpression;

  constructor(module: Symbol, symbol: Symbol, resultType: CheckedTypeExpression, phase: FunctionPhase) {
    this.module = module;
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

export class Scope {
  readonly #parent: Scope | undefined;
  readonly #symbols: Map<string, PhaseType>;
  readonly #protocols: Set<Symbol>;
  readonly qualifier: Qualifier;
  readonly functionScope: FunctionScope;

  private constructor(parent: Scope | undefined, declared: Map<string, PhaseType> | undefined, qualifier: Qualifier, functionScope: FunctionScope, protocols: Set<Symbol>) {
    this.#parent = parent;
    this.#symbols = (declared ?? Map<string, PhaseType>()).asMutable();
    this.#protocols = protocols;
    this.qualifier = qualifier;
    this.functionScope = functionScope;
  }

  static init(declared: Map<string, PhaseType>, protocols: Set<Symbol>, qualifier: Qualifier, module: Symbol, resultType: CheckedTypeExpression): Scope {
    return new Scope(undefined, declared, qualifier, new FunctionScope(module, module, resultType, 'fun'), protocols);
  }

  childSelf(selfType: Symbol, typeParams: List<ParserTypeParameterType>): Scope {
    return new Scope(this, undefined, this.qualifier.includeSelf(selfType).includeTypeParams(selfType, typeParams), this.functionScope, this.#protocols);
  }

  child(): Scope {
    return new Scope(this, undefined, this.qualifier, this.functionScope, this.#protocols);
  }

  childFunction(symbol: Symbol, typeParams: List<ParserTypeParameterType>, resultType: CheckedTypeExpression, phase: FunctionPhase): Scope {
    const child = new Scope(this, undefined, this.qualifier.includeTypeParams(symbol, typeParams), new FunctionScope(this.functionScope.module, symbol, resultType, phase), this.#protocols);

    for (const typeParam of typeParams) {
      child.set(typeParam.name, new PhaseType(child.qualifier.checkTypeParamType(symbol, typeParam), 'const', typeParam.pos));
    }

    return child;
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

  protocols(): Set<Symbol> {
    return this.#protocols;
  }
}
