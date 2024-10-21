import { DependencyDictionary, PackageName, Position, Symbol, Version } from "../ast.js";
import { coreLib } from "../lib.js";
import { List, Map } from "immutable";
import { Checker, Scope } from "../checker/checker.js";
import { ok } from "node:assert";
import { Qualifier } from "../checker/collector.js";
import { describe, it } from "node:test";
import { CheckedAccessRecord, CheckedFunctionType, CheckedFunctionTypeParameter } from "../checker/checkerAst.js";
import {
  ParserBlockEx,
  ParserBooleanLiteralEx,
  ParserCallEx,
  ParserExpression,
  ParserExpressionStatement,
  ParserFloatLiteralEx,
  ParserIdentifierEx,
  ParserIntLiteralEx,
  ParserLambdaEx,
  ParserListLiteralEx,
  ParserNominalType,
  ParserParameter,
  ParserReturnEx,
  ParserStaticAccessEx,
  ParserStringLiteralEx
} from "../parser/parserAst.js";

const version = new Version(0, 1, 0);
const packageName = new PackageName('sample', 'sample', version);
const root = new Symbol(packageName);
const pos = new Position('sample', 1, 1);

const depDict = new DependencyDictionary();
const rootManager = depDict.addManager(packageName);
const {package: corePackage, preamble, coreTypes} = coreLib();
depDict.addManager(corePackage.name);
rootManager.addDependency(corePackage.name);

const checker = new Checker(rootManager, Map<PackageName, Map<Symbol, CheckedAccessRecord>>().set(corePackage.name, corePackage.declarations), coreTypes, preamble);
const qualifier = new Qualifier(preamble);
const preambleScope = preamble.map(name => corePackage.declarations.get(name)!!.type);

function testScope(): Scope {
  return Scope.init(preambleScope, qualifier, root, coreTypes.unit);
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
      func: new ParserStaticAccessEx({
        pos,
        path: List.of(
          new ParserIdentifierEx({
            pos,
            name: 'core',
          }), new ParserIdentifierEx({
            pos,
            name: 'list',
          }), new ParserIdentifierEx({
            pos,
            name: 'get',
          })
        ),
      }),
      typeArgs: List(),
      args: List.of<ParserExpression>(
        new ParserListLiteralEx({
          pos,
          values: List.of(
            new ParserIntLiteralEx({
              pos,
              value: 1,
            }),
          ),
        }),
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
      phase: 'fun',
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
              })
            )
          }),
        })
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
    // core::list::map([1, 2, 3], { x => toString(x) })

    // this whole AST just to represent the code above
    const actual = checker.checkCall(new ParserCallEx({
      pos,
      func: new ParserStaticAccessEx({
        pos,
        path: List.of(
          new ParserIdentifierEx({
            pos,
            name: 'core',
          }), new ParserIdentifierEx({
            pos,
            name: 'list',
          }), new ParserIdentifierEx({
            pos,
            name: 'map'
          })
        ),
      }),
      typeArgs: List(),
      args: List.of<ParserExpression>(
        new ParserListLiteralEx({
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
              value: 3
            }),
          ),
        }),
        new ParserLambdaEx({
          pos,
          phase: 'fun',
          params: List.of(
            new ParserParameter({
              pos,
              name: 'x',
              phase: undefined,
              type: undefined, // the type is not declared
            })
          ),
          body: new ParserCallEx({
            pos,
            func: new ParserIdentifierEx({
              pos,
              name: 'toString'
            }),
            typeArgs: List(),
            args: List.of(
              new ParserIdentifierEx({
                pos,
                name: 'x',
              }),
            )
          }),
        }),
      ),
    }), testScope());

    ok(actual.type.equals(coreTypes.listOf(coreTypes.string)), 'call does not return a list of strings like it should');
  });
});

