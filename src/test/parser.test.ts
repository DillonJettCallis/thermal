import {
  AccessExpression, BlockEx,
  BooleanLiteralEx, CallEx, ConstructExpression,
  Expression, ExpressionStatement,
  FloatLiteralEx, IdentifierEx,
  IntLiteralEx, LambdaEx, ListLiteralEx, MapLiteralEx,
  PackageName,
  Position, SetLiteralEx, StaticAccessExpression, StringLiteralEx,
  Symbol,
  Version
} from "../ast.js";
import { Parser } from "../parser.js";
import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";

const version = new Version(0, 1, 0);
const packageName = new PackageName('sample', 'sample', version);
const root = new Symbol(packageName);
const src = 'sample';

function expressionParserTest<Out extends Expression>({code, expected}: { code: string, expected: Out }): void {
  const actual = Parser.parseExpression(src, code, root);

  deepStrictEqual(actual, expected)
}

describe('Parser', () => {
  it('should parse a simple integer literal', () => expressionParserTest<IntLiteralEx>({
    code: '1',
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'intLiteral',
      value: 1,
    }
  }));

  it('should parse a simple float literal', () => expressionParserTest<FloatLiteralEx>({
    code: '1.5',
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'floatLiteral',
      value: 1.5,
    }
  }));

  it('should parse a simple true literal', () => expressionParserTest<BooleanLiteralEx>({
    code: 'true',
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'booleanLiteral',
      value: true,
    }
  }));

  it('should parse a simple false literal', () => expressionParserTest<BooleanLiteralEx>({
    code: 'false',
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'booleanLiteral',
      value: false,
    }
  }));

  it('should parse a simple identifier', () => expressionParserTest<IdentifierEx>({
    code: 'something',
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'identifier',
      name: 'something',
    }
  }));

  it('should parse a simple list of integers', () => expressionParserTest<ListLiteralEx>({
    code: '[1, 2, 3]',
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'list',
      values: [
        {
          pos: new Position(src, 1, 2),
          kind: 'intLiteral',
          value: 1,
        } satisfies IntLiteralEx,
        {
          pos: new Position(src, 1, 5),
          kind: 'intLiteral',
          value: 2,
        } satisfies IntLiteralEx,
        {
          pos: new Position(src, 1, 8),
          kind: 'intLiteral',
          value: 3,
        } satisfies IntLiteralEx,
      ]
    }
  }));

  it('should parse a simple set of integers', () => expressionParserTest<SetLiteralEx>({
    code: '%[1, 2, 3]',
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'set',
      values: [
        {
          pos: new Position(src, 1, 3),
          kind: 'intLiteral',
          value: 1,
        } satisfies IntLiteralEx,
        {
          pos: new Position(src, 1, 6),
          kind: 'intLiteral',
          value: 2,
        } satisfies IntLiteralEx,
        {
          pos: new Position(src, 1, 9),
          kind: 'intLiteral',
          value: 3,
        } satisfies IntLiteralEx,
      ]
    }
  }));

  it('should parse a simple map of strings to integers', () => expressionParserTest<MapLiteralEx>({
    code: `#['one': 1, 'two': 2, 'three': 3]`,
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'map',
      values: [
        {
          key: {
            pos: new Position(src, 1, 3),
            kind: 'stringLiteral',
            value: 'one',
          } satisfies StringLiteralEx,
          value: {
            pos: new Position(src, 1, 10),
            kind: 'intLiteral',
            value: 1,
          } satisfies IntLiteralEx,
        },
        {
          key: {
            pos: new Position(src, 1, 13),
            kind: 'stringLiteral',
            value: 'two',
          } satisfies StringLiteralEx,
          value: {
            pos: new Position(src, 1, 20),
            kind: 'intLiteral',
            value: 2,
          } satisfies IntLiteralEx,
        },
        {
          key: {
            pos: new Position(src, 1, 23),
            kind: 'stringLiteral',
            value: 'three',
          } satisfies StringLiteralEx,
          value: {
            pos: new Position(src, 1, 32),
            kind: 'intLiteral',
            value: 3,
          } satisfies IntLiteralEx,
        },
      ]
    }
  }));

  it('should parse a simple access expression', () => expressionParserTest<AccessExpression>({
    code: 'some.thing',
    expected: {
      pos: new Position(src, 1, 5),
      kind: 'access',
      base: {
        pos: new Position(src, 1, 1),
        kind: 'identifier',
        name: 'some'
      } satisfies IdentifierEx,
      field: {
        pos: new Position(src, 1, 6),
        kind: 'identifier',
        name: 'thing',
      },
    }
  }));

  it('should parse a simple static expression', () => expressionParserTest<StaticAccessExpression>({
    code: 'some::thing',
    expected: {
      pos: new Position(src, 1, 5),
      kind: 'staticAccess',
      path: [
        {
          pos: new Position(src, 1, 1),
          kind: 'identifier',
          name: 'some'
        },
        {
          pos: new Position(src, 1, 7),
          kind: 'identifier',
          name: 'thing',
        }
      ],
    }
  }));

  it('should parse a simple struct constructor', () => expressionParserTest<ConstructExpression>({
    code: `
Entry {
  key: 'a key',
  value: 42,
}`,
    expected: {
      pos: new Position(src, 2, 1),
      kind: 'construct',
      base: {
        pos: new Position(src, 2, 1),
        kind: 'identifier',
        name: 'Entry',
      } satisfies IdentifierEx,
      fields: [
        {
          pos: new Position(src, 3, 3),
          name: 'key',
          value: {
            pos: new Position(src, 3, 8),
            kind: 'stringLiteral',
            value: 'a key',
          } satisfies StringLiteralEx,
        }, {
          pos: new Position(src, 4, 3),
          name: 'value',
          value: {
            pos: new Position(src, 4, 10),
            kind: 'intLiteral',
            value: 42,
          } satisfies IntLiteralEx,
        }
      ]
    }
  }));

  it('should parse a simple lambda that takes no params and returns true', () => expressionParserTest<LambdaEx>({
    code: 'fun { => true }',
    expected: {
      pos: new Position(src, 1, 1),
      kind: 'function',
      phase: 'fun',
      params: [],
      body: {
        pos: new Position(src, 1, 1),
        kind: 'block',
        body: [
          {
            pos: new Position(src, 1, 1),
            kind: 'expression',
            expression: {
              pos: new Position(src, 1, 10),
              kind: 'booleanLiteral',
              value: true,
            } satisfies BooleanLiteralEx,
          } satisfies ExpressionStatement,
        ]
      } satisfies BlockEx,
    }
  }));

  it('should parse a simple plus operator on two int literals', () => expressionParserTest<CallEx>({
    code: '4 + 5',
    expected: {
      pos: new Position(src, 1, 3),
      kind: 'call',
      func: {
        pos: new Position(src, 1, 3),
        kind: 'identifier',
        name: '+',
      } satisfies IdentifierEx,
      typeArgs: undefined,
      args: [
        {
          pos: new Position(src, 1, 1),
          kind: 'intLiteral',
          value: 4,
        } satisfies IntLiteralEx,
        {
          pos: new Position(src, 1, 5),
          kind: 'intLiteral',
          value: 5,
        } satisfies IntLiteralEx,
      ]
    }
  }));

  it('should parse a math expression that mixes plus and multiply', () => {
    const actual = Parser.parseExpression(src, '4 + 5 * 3', root);

    deepStrictEqual(actual, {
        pos: new Position(src, 1, 3),
        kind: 'call',
        func: {
          pos: new Position(src, 1, 3),
          kind: 'identifier',
          name: '+',
        } satisfies IdentifierEx,
        typeArgs: undefined,
        args: [
          {
            pos: new Position(src, 1, 1),
            kind: 'intLiteral',
            value: 4,
          } satisfies IntLiteralEx,
          {
            pos: new Position(src, 1, 7),
            kind: 'call',
            func: {
              pos: new Position(src, 1, 7),
              kind: 'identifier',
              name: '*',
            } satisfies IdentifierEx,
            typeArgs: undefined,
            args: [
              {
                pos: new Position(src, 1, 5),
                kind: 'intLiteral',
                value: 5,
              } satisfies IntLiteralEx,
              {
                pos: new Position(src, 1, 9),
                kind: 'intLiteral',
                value: 3,
              } satisfies IntLiteralEx,
            ]
          } satisfies CallEx,

        ]
      } satisfies CallEx,
    )
  });
})

