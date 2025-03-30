import { DependencyDictionary, PackageName, Position, Symbol, TypeDictionary, Version, PhaseType } from '../ast.ts';
import { coreLib } from '../lib.ts';
import { List, Set } from 'immutable';
import { Checker, Scope } from '../checker/checker.ts';
import { equal, ok, throws } from 'node:assert';
import { collectSymbols, Qualifier } from '../checker/collector.ts';
import { describe, it } from 'node:test';
import { CheckedFunctionType, CheckedFunctionTypeParameter } from '../checker/checkerAst.ts';
import {
  ParserAccessEx,
  ParserBlockEx,
  ParserBooleanLiteralEx,
  ParserCallEx,
  type ParserExpression,
  ParserExpressionStatement,
  ParserFloatLiteralEx,
  ParserFunctionStatement,
  ParserIdentifierEx,
  ParserIntLiteralEx,
  ParserLambdaEx,
  ParserListLiteralEx,
  ParserNominalType,
  ParserParameter,
  ParserReturnEx,
  ParserStringLiteralEx
} from '../parser/parserAst.ts';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRootPath = resolve(fileURLToPath(import.meta.url), '../../..');
const version = new Version(0, 1, 0);
const packageName = new PackageName('sample', 'sample', version);
const root = new Symbol(packageName);
const pos = new Position('sample', 1, 1);

const depDict = new DependencyDictionary();
const rootManager = depDict.addManager(packageName);
const {package: corePackage, preamble, coreTypes} = coreLib(projectRootPath);
const coreManager = depDict.addManager(corePackage.name);
rootManager.addDependency(corePackage.name);

const corePack = collectSymbols(corePackage.name, corePackage.files, coreManager, preamble);

const typeDict = new TypeDictionary();
typeDict.loadPackage(corePack);

const checker = new Checker(rootManager, typeDict, coreTypes, preamble);
const qualifier = new Qualifier(preamble);
const preambleScope = preamble.map(name => {
  const type = typeDict.lookupSymbol(name)?.type;
  if (type === undefined) {
    throw new Error('Huh? Something is very wrong!');
  }

  return new PhaseType(type, 'const', pos);
});

function testScope(): Scope {
  return Scope.init(preambleScope, Set(), qualifier, root, coreTypes.unit);
}

describe('Checker', () => {
  it('should typecheck a plain integer literal', () => {
    const actual = checker.checkIntLiteral(new ParserIntLiteralEx({
      pos,
      value: 1,
    }));

    ok(actual.type.equals(coreTypes.int));
  });

  it('should typecheck a plain float literal', () => {
    const actual = checker.checkFloatLiteral(new ParserFloatLiteralEx({
      pos,
      value: 1.5,
    }));

    ok(actual.type.equals(coreTypes.float));
  });

  it('should typecheck a plain boolean literal', () => {
    const actual = checker.checkBooleanLiteral(new ParserBooleanLiteralEx({
      pos,
      value: true,
    }));

    ok(actual.type.equals(coreTypes.boolean));
  });

  it('should typecheck a plain string literal', () => {
    const actual = checker.checkStringLiteral(new ParserStringLiteralEx({
      pos,
      value: 'test',
    }));

    ok(actual.type.equals(coreTypes.string));
  });

  it('should typecheck a plain int addition operation', () => {
    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserIdentifierEx({
        pos,
        name: '+',
      }),
      typeArgs: List(),
      args: List.of(
        new ParserIntLiteralEx({
          pos,
          value: 1,
        }),
        new ParserIntLiteralEx({
          pos,
          value: 1,
        }),
      ),
    }), testScope());

    ok(actual.type.equals(coreTypes.int));
  });

  it('should typecheck a plain float addition operation', () => {
    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserIdentifierEx({
        pos,
        name: '+',
      }),
      typeArgs: List(),
      args: List.of(
        new ParserFloatLiteralEx({
          pos,
          value: 1.5,
        }),
        new ParserFloatLiteralEx({
          pos,
          value: 1.5,
        }),
      ),
    }), testScope());

    ok(actual.type.equals(coreTypes.float));
  });

  it('should typecheck a list get operation', () => {
    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserAccessEx({
        pos,
        base: new ParserListLiteralEx({
          pos,
          values: List.of(
            new ParserIntLiteralEx({
              pos,
              value: 1
            })
          )
        }),
        field: new ParserIdentifierEx({
          pos,
          name: 'get'
        })
      }),
      typeArgs: List(),
      args: List.of<ParserExpression>(
        new ParserIntLiteralEx({
          pos,
          value: 0,
        }),
      ),
    }), testScope());

    ok(actual.type.equals(coreTypes.int));
  });

  it('should typecheck a return from a lambda', () => {
    // { x: Int => return x }

    // this whole AST just to represent the code above
    const actual = checker.checkLambda(new ParserLambdaEx({
      pos,
      functionPhase: 'fun',
      params: List.of(
        new ParserParameter({
          pos,
          name: 'x',
          phase: undefined,
          type: new ParserNominalType({
            pos,
            name: List.of(
              new ParserIdentifierEx({
                pos,
                name: 'Int',
              }),
            ),
          }),
        }),
      ),
      body: new ParserBlockEx({
        pos,
        body: List.of(
          new ParserExpressionStatement({
            pos,
            expression: new ParserReturnEx({
              pos,
              base: new ParserIdentifierEx({
                pos,
                name: 'x',
              }),
            }),
          }),
        ),
      }),
    }), testScope(), undefined);

    const expected = new CheckedFunctionType({
      phase: 'fun',
      typeParams: List(),
      params: List.of(new CheckedFunctionTypeParameter({
        phase: undefined,
        type: coreTypes.int,
      })),
      result: coreTypes.int,
    });

    ok(actual.type.equals(expected), 'lambda return type is wrong.');
  });

  it('should typecheck a call to List::map with a lambda literal', () => {
    // [1, 2, 3].map({ x => x.toString() })

    // this whole AST just to represent the code above
    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserAccessEx({
        pos,
        base: new ParserListLiteralEx({
          pos,
          values: List.of(
            new ParserIntLiteralEx({
              pos,
              value: 1,
            }), new ParserIntLiteralEx({
              pos,
              value: 2,
            }), new ParserIntLiteralEx({
              pos,
              value: 3,
            }),
          ),
        }),
        field: new ParserIdentifierEx({
          pos,
          name: 'map',
        }),
      }),
      typeArgs: List(),
      args: List.of<ParserExpression>(
        new ParserLambdaEx({
          pos,
          functionPhase: 'fun',
          params: List.of(
            new ParserParameter({
              pos,
              name: 'x',
              phase: undefined,
              type: undefined, // the type is not declared
            }),
          ),
          body: new ParserCallEx({
            pos,
            func: new ParserAccessEx({
              pos,
              base: new ParserIdentifierEx({
                pos,
                name: 'x',
              }),
              field: new ParserIdentifierEx({
                pos,
                name: 'toString',
              }),
            }),
            typeArgs: List(),
            args: List(),
          }),
        }),
      ),
    }), testScope());

    ok(actual.type.equals(coreTypes.listOf(coreTypes.string)), 'call does not return a List of Strings like it should');
  });

  it('should typecheck a call to List::flatMap with a lambda literal', () => {
    // [1, 2, 3].flatMap({ x => [x, x * 2] })

    // this whole AST just to represent the code above
    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserAccessEx({
        pos,
        base: new ParserListLiteralEx({
          pos,
          values: List.of(
            new ParserIntLiteralEx({
              pos,
              value: 1,
            }), new ParserIntLiteralEx({
              pos,
              value: 2,
            }), new ParserIntLiteralEx({
              pos,
              value: 3,
            }),
          ),
        }),
        field: new ParserIdentifierEx({
          pos,
          name: 'flatMap',
        }),
      }),
      typeArgs: List(),
      args: List.of<ParserExpression>(
        new ParserLambdaEx({
          pos,
          functionPhase: 'fun',
          params: List.of(
            new ParserParameter({
              pos,
              name: 'x',
              phase: undefined,
              type: undefined, // the type is not declared
            }),
          ),
          body: new ParserListLiteralEx({
            pos,
            values: List.of<ParserExpression>(
              new ParserIdentifierEx({
                pos,
                name: 'x',
              }),
              new ParserCallEx({
                pos,
                func: new ParserIdentifierEx({
                  pos,
                  name: '+',
                }),
                typeArgs: List(),
                args: List.of<ParserExpression>(
                  new ParserIdentifierEx({
                    pos,
                    name: 'x',
                  }),
                  new ParserIntLiteralEx({
                    pos,
                    value: 2,
                  }),
                ),
              }),
            ),
          }),
        }),
      ),
    }), testScope());

    ok(actual.type.equals(coreTypes.listOf(coreTypes.int)), 'call does not return a List of Ints like it should');
  });

  it('should check that a literal is const phase', () => {
    const actual = checker.checkIntLiteral(new ParserIntLiteralEx({
      pos,
      value: 1,
    }));

    equal(actual.phase, 'const');
  });

  it('should show that a call passed only const inputs should return a const expression', () => {
    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserIdentifierEx({
        pos,
        name: '==',
      }),
      typeArgs: List(),
      args: List.of(
        new ParserIntLiteralEx({
          pos,
          value: 1,
        }),
        new ParserIntLiteralEx({
          pos,
          value: 1,
        }),
      ),
    }), testScope());

    equal(actual.phase, 'const');
  });

  it('should show that a call passed only const and val input should return a val expression', () => {
    // init the root scope
    const parentScope = testScope();

    // set up the child scope with a variable named 'x' that we will use
    const scope = parentScope.childFunction(root.child('testFunc'), List(), coreTypes.nothing, 'fun');
    scope.set('x', new PhaseType(coreTypes.int, 'val', pos));

    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserIdentifierEx({
        pos,
        name: '==',
      }),
      typeArgs: List(),
      args: List.of<ParserExpression>(
        new ParserIntLiteralEx({
          pos,
          value: 1,
        }),
        new ParserIdentifierEx({
          // use 'x', which is 'val', thus making the whole function call 'val'
          pos,
          name: 'x',
        }),
      ),
    }), scope);

    equal(actual.phase, 'val');
  });

  it('should show that a call passed flow input should return a flow expression', () => {
    // init the root scope
    const parentScope = testScope();

    // set up the child scope with a variable named 'x' that we will use
    const scope = parentScope.childFunction(root.child('testFunc'), List(), coreTypes.nothing, 'fun');
    scope.set('x', new PhaseType(coreTypes.int, 'flow', pos));

    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserIdentifierEx({
        pos,
        name: '==',
      }),
      typeArgs: List(),
      args: List.of<ParserExpression>(
        new ParserIntLiteralEx({
          pos,
          value: 1,
        }),
        new ParserIdentifierEx({
          // use 'x', which is 'flow', thus making the whole function call 'flow'
          pos,
          name: 'x',
        }),
      ),
    }), scope);

    equal(actual.phase, 'flow');
  });

  it('should show that a call passed var input should return a flow expression', () => {
    // init the root scope
    const parentScope = testScope();

    // set up the child scope with a variable named 'x' that we will use
    const scope = parentScope.childFunction(root.child('testFunc'), List(), coreTypes.nothing, 'fun');
    scope.set('x', new PhaseType(coreTypes.int, 'var', pos));

    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserIdentifierEx({
        pos,
        name: '==',
      }),
      typeArgs: List(),
      args: List.of<ParserExpression>(
        new ParserIntLiteralEx({
          pos,
          value: 1,
        }),
        new ParserIdentifierEx({
          // use 'x', which is 'var', thus making the whole function call 'flow'
          pos,
          name: 'x',
        }),
      ),
    }), scope);

    equal(actual.phase, 'flow');
  });

  it('should reject a fun that attempts to take a flow parameter', () => {
    const input = new ParserFunctionStatement({
      pos,
      name: 'test',
      phase: 'const',
      typeParams: List(),
      result: new ParserNominalType({
        pos,
        name: List.of(
          new ParserIdentifierEx({
            pos,
            name: 'Int',
          }),
        ),
      }),
      functionPhase: 'fun',
      params: List.of(
        new ParserParameter({
          pos,
          phase: 'flow',
          name: 'x',
          type: new ParserNominalType({
            pos,
            name: List.of(
              new ParserIdentifierEx({
                pos,
                name: 'Int',
              }),
            ),
          }),
        }),
      ),
      body: new ParserIntLiteralEx({
        pos,
        value: 0,
      }),
    });

    throws(() => {
      checker.checkFunctionStatement(input, testScope(), root);
    }, {
      message: `Attempt to require a 'flow' parameter in a 'fun' function. A 'fun' function can only have 'const' or 'val' parameters at ${pos.describe()}`,
    });
  });

  it('should allow a fun function to close over a flow, as long as the resulting expression is flow', () => {
    // init the root scope
    const parentScope = testScope();

    // set up the child scope with a variable named 'x' that we will use
    const scope = parentScope.childFunction(root.child('testFunc'), List(), coreTypes.nothing, 'fun');
    scope.set('x', new PhaseType(coreTypes.int, 'flow', pos));

    const actual = checker.checkFunctionStatement(new ParserFunctionStatement({
      pos,
      name: 'testFunc',
      phase: 'flow',
      typeParams: List(),
      result: new ParserNominalType({
        pos,
        name: List.of(
          new ParserIdentifierEx({
            pos,
            name: 'Int',
          }),
        ),
      }),
      functionPhase: 'fun',
      params: List.of(
        new ParserParameter({
          pos,
          name: 'y',
          phase: undefined,
          type: new ParserNominalType({
            pos,
            name: List.of(
              new ParserIdentifierEx({
                pos,
                name: 'Int',
              }),
            ),
          }),
        }),
      ),
      body: new ParserCallEx({
        pos,
        typeArgs: List(),
        func: new ParserIdentifierEx({
          pos,
          name: '+',
        }),
        args: List.of(
          new ParserIdentifierEx({
            pos,
            name: 'x',
          }),
          new ParserIdentifierEx({
            pos,
            name: 'y',
          }),
        ),
      }),
    }), scope, root);

    equal(actual.phase, 'flow');
  });

  it('should not allow a fun function to close over a flow if the final expression is marked const', () => {
    // init the root scope
    const parentScope = testScope();

    // set up the child scope with a variable named 'x' that we will use
    const scope = parentScope.childFunction(root.child('testFunc'), List(), coreTypes.nothing, 'fun');
    scope.set('x', new PhaseType(coreTypes.int, 'flow', pos));

    const input = new ParserFunctionStatement({
      pos,
      name: 'testFunc',
      phase: 'const',
      typeParams: List(),
      result: new ParserNominalType({
        pos,
        name: List.of(
          new ParserIdentifierEx({
            pos,
            name: 'Int',
          }),
        ),
      }),
      functionPhase: 'fun',
      params: List.of(
        new ParserParameter({
          pos,
          name: 'y',
          phase: undefined,
          type: new ParserNominalType({
            pos,
            name: List.of(
              new ParserIdentifierEx({
                pos,
                name: 'Int',
              }),
            ),
          }),
        }),
      ),
      body: new ParserCallEx({
        pos,
        typeArgs: List(),
        func: new ParserIdentifierEx({
          pos,
          name: '+',
        }),
        args: List.of(
          new ParserIdentifierEx({
            pos,
            name: 'x',
          }),
          new ParserIdentifierEx({
            pos,
            name: 'y',
          }),
        ),
      }),
    });

    throws(() => {
      checker.checkFunctionStatement(input, scope, root);
    }, {
      message: `Attempt to declare 'const' function, but body is actually 'flow'. This function must close over values outside of the allowed phase. at ${pos.describe()}`,
    });
  });
});

