import {
  AccessRecord,
  BlockEx,
  BooleanLiteralEx,
  CallEx,
  DependencyDictionary,
  Expression,
  ExpressionStatement,
  FloatLiteralEx,
  IdentifierEx,
  IntLiteralEx,
  LambdaEx,
  ListLiteralEx,
  PackageName,
  Position,
  ReturnEx,
  StaticAccessExpression,
  StringLiteralEx,
  Symbol,
  TypeExpression, typesEqual,
  UncheckedNominalType,
  Version
} from "../ast.js";
import { coreLib } from "../lib.js";
import { Map } from "immutable";
import { Checker, Rule, Scope } from "../checker/checker.js";
import { deepStrictEqual, ok } from "node:assert";
import { Qualifier } from "../checker/collector.js";
import { describe, it } from "node:test";

const version = new Version(0, 1, 0);
const packageName = new PackageName('sample', 'sample', version);
const root = new Symbol(packageName);
const pos = new Position('sample', 1, 1);

const depDict = new DependencyDictionary();
const rootManager = depDict.addManager(packageName);
const {package: corePackage, preamble, coreTypes} = coreLib();
depDict.addManager(corePackage.name);
rootManager.addDependency(corePackage.name);

const checker = new Checker(rootManager, Map<PackageName, Map<Symbol, AccessRecord>>().set(corePackage.name, corePackage.declarations), coreTypes, preamble);
const qualifier = new Qualifier(preamble);
const preambleScope = preamble.map(name => corePackage.declarations.get(name)!!.type);

function testStandalone({ex, rule, expected}: {
  ex: Expression,
  rule: Rule<Expression>,
  expected?: TypeExpression | undefined
}): TypeExpression {
  ok(rule.test(ex, expected), 'rule does not apply');

  return rule.type(Scope.init(preambleScope, qualifier, root, coreTypes.unit), ex, expected).type;
}

describe('Checker', () => {
  it('should typecheck a plain integer literal', () => {
    const actual = testStandalone({
      ex: {
        pos,
        kind: 'intLiteral',
        value: 1,
      } satisfies IntLiteralEx,
      rule: checker.intRule(),
    });

    deepStrictEqual(actual, coreTypes.int);
  });

  it('should typecheck a plain float literal', () => {
    const actual = testStandalone({
      ex: {
        pos,
        kind: 'floatLiteral',
        value: 1.5,
      } satisfies FloatLiteralEx,
      rule: checker.floatRule(),
    });

    deepStrictEqual(actual, coreTypes.float);
  });

  it('should typecheck a plain boolean literal', () => {
    const actual = testStandalone({
      ex: {
        pos,
        kind: 'booleanLiteral',
        value: true,
      } satisfies BooleanLiteralEx,
      rule: checker.booleanRule(),
    });

    deepStrictEqual(actual, coreTypes.boolean);
  });

  it('should typecheck a plain string literal', () => {
    const actual = testStandalone({
      ex: {
        pos,
        kind: 'stringLiteral',
        value: 'test',
      } satisfies StringLiteralEx,
      rule: checker.stringRule(),
    });

    deepStrictEqual(actual, coreTypes.string);
  });

  it('should typecheck a plain int addition operation', () => {
    const actual = testStandalone({
      ex: {
        pos,
        kind: 'call',
        func: {
          pos,
          kind: 'identifier',
          name: '+',
        } satisfies IdentifierEx,
        typeArgs: [],
        args: [
          {
            pos,
            kind: 'intLiteral',
            value: 1,
          } satisfies IntLiteralEx,
          {
            pos,
            kind: 'intLiteral',
            value: 1,
          } satisfies IntLiteralEx,
        ],
      } satisfies CallEx,
      rule: checker.callRule(),
    });

    deepStrictEqual(actual, coreTypes.int);
  });

  it('should typecheck a plain float addition operation', () => {
    const actual = testStandalone({
      ex: {
        pos,
        kind: 'call',
        func: {
          pos,
          kind: 'identifier',
          name: '+',
        } satisfies IdentifierEx,
        typeArgs: [],
        args: [
          {
            pos,
            kind: 'floatLiteral',
            value: 1.5,
          } satisfies FloatLiteralEx,
          {
            pos,
            kind: 'floatLiteral',
            value: 1.5,
          } satisfies FloatLiteralEx,
        ],
      } satisfies CallEx,
      rule: checker.callRule(),
    });

    deepStrictEqual(actual, coreTypes.float);
  });

  it('should typecheck a list get operation', () => {
    const actual = testStandalone({
      ex: {
        pos,
        kind: 'call',
        func: {
          pos,
          kind: 'staticAccess',
          path: [{
            pos,
            kind: 'identifier',
            name: 'core',
          }, {
            pos,
            kind: 'identifier',
            name: 'list',
          }, {
            pos,
            kind: 'identifier',
            name: 'get',
          }],
        } satisfies StaticAccessExpression,
        typeArgs: [],
        args: [
          {
            pos,
            kind: 'list',
            values: [
              {
                pos,
                kind: 'intLiteral',
                value: 1,
              } satisfies IntLiteralEx,
            ],
          } satisfies ListLiteralEx,
          {
            pos,
            kind: 'intLiteral',
            value: 0,
          } satisfies IntLiteralEx,
        ],
      } satisfies CallEx,
      rule: checker.callRule(),
    });

    deepStrictEqual(actual, coreTypes.int);
  });

  it('should typecheck a return from a lambda', () => {
    // { x: Int => return x }

    // this whole AST just to represent the code above
    const actual = testStandalone({
      ex: {
        pos,
        phase: 'fun',
        kind: 'function',
        params: [
          {
            pos,
            name: 'x',
            phase: undefined,
            type: {
              pos,
              kind: 'nominal',
              name: [
                {
                  pos,
                  kind: 'identifier',
                  name: 'Int',
                }
              ]
            } satisfies UncheckedNominalType,
          }
        ],
        body: {
          pos,
          kind: 'block',
          body: [
            {
              pos,
              kind: 'expression',
              expression: {
                pos,
                kind: 'return',
                expression: {
                  pos,
                  kind: 'identifier',
                  name: 'x',
                } satisfies IdentifierEx,
              } satisfies ReturnEx,
            } satisfies ExpressionStatement,
          ],
        } satisfies BlockEx,
      } satisfies LambdaEx,
      rule: checker.lambdaRule(),
    });

    ok(actual.kind === 'function', 'type of lambda is not a function');
    ok(typesEqual(actual.result, coreTypes.int), 'lambda return type is wrong.');
  });

  it('should typecheck a call to List::map with a lambda literal', () => {
    // core::list::map([1, 2, 3], { x => toString(x) })

    // this whole AST just to represent the code above
    const actual = testStandalone({
      ex: {
        pos,
        kind: 'call',
        func: {
          pos,
          kind: 'staticAccess',
          path: [{
            pos,
            kind: 'identifier',
            name: 'core',
          },{
            pos,
            kind: 'identifier',
            name: 'list',
          }, {
            pos,
            kind: 'identifier',
            name: 'map'
          }],
        } satisfies StaticAccessExpression,
        typeArgs: [],
        args: [
          {
            pos,
            kind: 'list',
            values: [
              {
                pos,
                kind: 'intLiteral',
                value: 1,
              } satisfies IntLiteralEx, {
                pos,
                kind: 'intLiteral',
                value: 2,
              } satisfies IntLiteralEx, {
                pos,
                kind: 'intLiteral',
                value: 3
              } satisfies IntLiteralEx,
            ]
          } satisfies ListLiteralEx,
          {
            pos,
            phase: 'fun',
            kind: 'function',
            params: [
              {
                pos,
                name: 'x',
                phase: undefined,
                type: undefined, // the type is not declared
              }
            ],
            body: {
              pos,
              kind: 'call',
              func: {
                pos,
                kind: "identifier",
                name: 'toString'
              } satisfies IdentifierEx,
              typeArgs: [],
              args: [
                {
                  pos,
                  kind: 'identifier',
                  name: 'x',
                } satisfies IdentifierEx,
              ]
            } satisfies CallEx,
          } satisfies LambdaEx,
        ]
      } satisfies CallEx,
      rule: checker.callRule(),
    });

    ok(typesEqual(actual, coreTypes.listOf(coreTypes.string)), 'call does not return a list of strings like it should');
  });
});

