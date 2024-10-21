import { PackageName, Position, Symbol, Version } from "../ast.js";
import { Parser } from "../parser/parser.js";
import { ok } from "node:assert";
import { describe, it } from "node:test";
import {
  ParserAccessEx,
  ParserBlockEx,
  ParserBooleanLiteralEx,
  ParserCallEx,
  ParserConstructEntry,
  ParserConstructEx,
  ParserExpression,
  ParserExpressionStatement,
  ParserFloatLiteralEx,
  ParserIdentifierEx,
  ParserIntLiteralEx,
  ParserLambdaEx,
  ParserListLiteralEx,
  ParserMapLiteralEntry,
  ParserMapLiteralEx,
  ParserSetLiteralEx,
  ParserStaticAccessEx,
  ParserStringLiteralEx
} from "../parser/parserAst.js";
import { List } from "immutable";

const version = new Version(0, 1, 0);
const packageName = new PackageName('sample', 'sample', version);
const root = new Symbol(packageName);
const src = 'sample';

function expressionParserTest({code, expected}: { code: string, expected: ParserExpression }): void {
  const actual = Parser.parseExpression(src, code, root);

  ok(actual.equals(expected));
}

describe('Parser', () => {
  it('should parse a simple integer literal', () => expressionParserTest({
    code: '1',
    expected: new ParserIntLiteralEx({
      pos: new Position(src, 1, 1),
      value: 1,
    }),
  }));

  it('should parse a simple float literal', () => expressionParserTest({
    code: '1.5',
    expected: new ParserFloatLiteralEx({
      pos: new Position(src, 1, 1),
      value: 1.5,
    }),
  }));

  it('should parse a simple true literal', () => expressionParserTest({
    code: 'true',
    expected: new ParserBooleanLiteralEx({
      pos: new Position(src, 1, 1),
      value: true,
    }),
  }));

  it('should parse a simple false literal', () => expressionParserTest({
    code: 'false',
    expected: new ParserBooleanLiteralEx({
      pos: new Position(src, 1, 1),
      value: false,
    }),
  }));

  it('should parse a simple identifier', () => expressionParserTest({
    code: 'something',
    expected: new ParserIdentifierEx({
      pos: new Position(src, 1, 1),
      name: 'something',
    }),
  }));

  it('should parse a simple list of integers', () => expressionParserTest({
    code: '[1, 2, 3]',
    expected: new ParserListLiteralEx({
      pos: new Position(src, 1, 1),
      values: List.of(
        new ParserIntLiteralEx({
          pos: new Position(src, 1, 2),
          value: 1,
        }),
        new ParserIntLiteralEx({
          pos: new Position(src, 1, 5),
          value: 2,
        }),
        new ParserIntLiteralEx({
          pos: new Position(src, 1, 8),
          value: 3,
        }),
      )
    }),
  }));

  it('should parse a simple set of integers', () => expressionParserTest({
    code: '%[1, 2, 3]',
    expected: new ParserSetLiteralEx({
      pos: new Position(src, 1, 1),
      values: List.of(
        new ParserIntLiteralEx({
          pos: new Position(src, 1, 3),
          value: 1,
        }),
        new ParserIntLiteralEx({
          pos: new Position(src, 1, 6),
          value: 2,
        }),
        new ParserIntLiteralEx({
          pos: new Position(src, 1, 9),
          value: 3,
        }),
      )
    })
  }));

  it('should parse a simple map of strings to integers', () => expressionParserTest({
    code: `#['one': 1, 'two': 2, 'three': 3]`,
    expected: new ParserMapLiteralEx({
      pos: new Position(src, 1, 1),
      values: List.of(
        new ParserMapLiteralEntry({
          pos: new Position(src, 1, 3),
          key: new ParserStringLiteralEx({
            pos: new Position(src, 1, 3),
            value: 'one',
          }),
          value: new ParserIntLiteralEx({
            pos: new Position(src, 1, 10),
            value: 1,
          }),
        }),
        new ParserMapLiteralEntry({
          pos: new Position(src, 1, 13),
          key: new ParserStringLiteralEx({
            pos: new Position(src, 1, 13),
            value: 'two',
          }),
          value: new ParserIntLiteralEx({
            pos: new Position(src, 1, 20),
            value: 2,
          }),
        }),
        new ParserMapLiteralEntry({
          pos: new Position(src, 1, 23),
          key: new ParserStringLiteralEx({
            pos: new Position(src, 1, 23),
            value: 'three',
          }),
          value: new ParserIntLiteralEx({
            pos: new Position(src, 1, 32),
            value: 3,
          }),
        }),
      )
    })
  }));

  it('should parse a simple access expression', () => expressionParserTest({
    code: 'some.thing',
    expected: new ParserAccessEx({
      pos: new Position(src, 1, 5),
      base: new ParserIdentifierEx({
        pos: new Position(src, 1, 1),
        name: 'some'
      }),
      field: new ParserIdentifierEx({
        pos: new Position(src, 1, 6),
        name: 'thing',
      }),
    })
  }));

  it('should parse a simple static expression', () => expressionParserTest({
    code: 'some::thing',
    expected: new ParserStaticAccessEx({
      pos: new Position(src, 1, 5),
      path: List.of(
        new ParserIdentifierEx({
          pos: new Position(src, 1, 1),
          name: 'some'
        }),
        new ParserIdentifierEx({
          pos: new Position(src, 1, 7),
          name: 'thing',
        }),
      ),
    })
  }));

  it('should parse a simple static function call', () => expressionParserTest({
    code: 'some::thing("an argument")',
    expected: new ParserCallEx({
      pos: new Position(src, 1, 5),
      func: new ParserStaticAccessEx({
        pos: new Position(src, 1, 5),
        path: List.of(
          new ParserIdentifierEx({
            pos: new Position(src, 1, 1),
            name: 'some'
          }),
          new ParserIdentifierEx({
            pos: new Position(src, 1, 7),
            name: 'thing',
          }),
        ),
      }),
      typeArgs: List(),
      args: List.of(
        new ParserStringLiteralEx({
          pos: new Position(src, 1, 13),
          value: 'an argument',
        }),
      ),
    }),
  }));

  it('should parse a simple struct constructor', () => expressionParserTest({
    code: `
Entry {
  key: 'a key',
  value: 42,
}`,
    expected: new ParserConstructEx({
      pos: new Position(src, 2, 1),
      base: new ParserIdentifierEx({
        pos: new Position(src, 2, 1),
        name: 'Entry',
      }),
      typeArgs: List(),
      fields: List.of(
        new ParserConstructEntry({
          pos: new Position(src, 3, 3),
          name: 'key',
          value: new ParserStringLiteralEx({
            pos: new Position(src, 3, 8),
            value: 'a key',
          }),
        }), new ParserConstructEntry({
          pos: new Position(src, 4, 3),
          name: 'value',
          value: new ParserIntLiteralEx({
            pos: new Position(src, 4, 10),
            value: 42,
          }),
        }),
      ),
    }),
  }));

  it('should parse a simple lambda that takes no params and returns true', () => expressionParserTest({
    code: 'fun { => true }',
    expected: new ParserLambdaEx({
      pos: new Position(src, 1, 1),
      phase: 'fun',
      params: List(),
      body: new ParserBlockEx({
        pos: new Position(src, 1, 1),
        body: List.of(
          new ParserExpressionStatement({
            pos: new Position(src, 1, 1),
            expression: new ParserBooleanLiteralEx({
              pos: new Position(src, 1, 10),
              value: true,
            }),
          }),
        ),
      }),
    }),
  }));

  it('should parse a simple plus operator on two int literals', () => expressionParserTest({
    code: '4 + 5',
    expected: new ParserCallEx({
      pos: new Position(src, 1, 3),
      func: new ParserIdentifierEx({
        pos: new Position(src, 1, 3),
        name: '+',
      }),
      typeArgs: List(),
      args: List.of(
        new ParserIntLiteralEx({
          pos: new Position(src, 1, 1),
          value: 4,
        }),
        new ParserIntLiteralEx({
          pos: new Position(src, 1, 5),
          value: 5,
        }),
      ),
    }),
  }));

  it('should parse a math expression that mixes plus and multiply', () => {
    const actual = Parser.parseExpression(src, '4 + 5 * 3', root);

    ok(actual.equals(new ParserCallEx({
        pos: new Position(src, 1, 3),
        func: new ParserIdentifierEx({
          pos: new Position(src, 1, 3),
          name: '+',
        }),
        typeArgs: List(),
        args: List.of<ParserExpression>(
          new ParserIntLiteralEx({
            pos: new Position(src, 1, 1),
            value: 4,
          }),
          new ParserCallEx({
            pos: new Position(src, 1, 7),
            func: new ParserIdentifierEx({
              pos: new Position(src, 1, 7),
              name: '*',
            }),
            typeArgs: List(),
            args: List.of(
              new ParserIntLiteralEx({
                pos: new Position(src, 1, 5),
                value: 5,
              }),
              new ParserIntLiteralEx({
                pos: new Position(src, 1, 9),
                value: 3,
              }),
            ),
          }),
        )
      }),
    ))
  });
})

