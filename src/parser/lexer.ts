import { readFileSync } from 'node:fs';
import { Set } from 'immutable';
import { Position } from "../ast.ts";

const whitespace = Set(' \t\r\n');
const digits = Set('0123456789');
const number = digits.concat(Set('_.'));
const quotes = Set('\'"`');
const identifierStartTest = /^[\p{L}_]$/u;
const identifierTest = /^[\p{L}_\d]$/u;
const keywords = Set.of(
  // the four expression types
  'const',
  'val',
  'var',
  'dyn',
  // the three function types
  'fun',
  'def',
  'sig',

  // the data types
  'struct',
  'enum',

  // the literals
  'true',
  'false',

  // control flow
  'if',
  'else',
  'match',
  'return',

  // operators
  'is',
  'isNot',

  // namespacing
  'import',

  // access
  'private',
  'protected',
  'package',
  'public',
  // the default value, 'internal' isn't marked with a keyword, and is only assessable by having no keywords

  // for mapping in javascript
  'extern',
);
const operators = Set.of(
  // parens
  '(',
  ')',
  '{',
  '}',
  // literals
  '[',
  '%[',
  '#[',
  ']',
  // compare/generics
  '<',
  '>',
  // comparison
  '<=',
  '>=',
  '==',
  '!=',
  '<=>',
  // math
  '+',
  '-',
  '*',
  '/',
  // assignment math
  '+=',
  '-=',
  '*=',
  '/=',
  // boolean
  '!',
  '&&',
  '||',
  // access
  '.',
  // assignment
  ':',
  '=',
  // name spacing
  '::',
  // separators
  ',',
  ';',
  // lambda
  '->',
  '=>',
);
const operatorSymbols = operators.flatMap(it => it);

export class Lexer {

  readonly #src: string;
  readonly #content: string;
  readonly #limit: number;

  #index: number = 0;
  #line: number = 1;
  #col: number = 1;

  private constructor(src: string, content: string) {
    this.#src = src;
    this.#content = content;
    this.#limit = content.length;
  }

  public static lexFile(path: string): Token[] {
    const content = readFileSync(path, {encoding: 'utf-8'}) as string;

    return new Lexer(path, content).#lexFile();
  }

  public static lexString(path: string, content: string): Token[] {
    return new Lexer(path, content).#lexFile();
  }

  #pos(): Position {
    return new Position(this.#src, this.#line, this.#col);
  }

  #endOfFile(): boolean {
    return this.#index >= this.#limit;
  }

  #peek(): string {
    if (this.#endOfFile()) {
      throw new Error('Out of bounds');
    } else {
      return this.#content[this.#index]!!;
    }
  }

  #skip(): void {
    if (this.#peek() == '\n') {
      this.#line++;
      this.#col = 1;
    } else {
      this.#col++;
    }

    this.#index++;
  }

  #next(): string {
    const next = this.#peek();
    this.#skip();
    return next;
  }

  #skipWhitespace(): boolean {
    // until we reach the end of the file, if the next char is whitespace, skip it
    while (!this.#endOfFile() && whitespace.has(this.#peek())) {
      this.#skip();
    }

    return !this.#endOfFile()
  }

  #lexFile(): Token[] {
    const tokens: Token[] = [];

    while (this.#skipWhitespace()) {
      tokens.push(this.#lexNext());
    }

    return tokens;
  }

  #lexNext(): Token {
    const pos = this.#pos();
    const first = this.#next();

    if (operatorSymbols.has(first)) {
      return {
        pos,
        kind: 'symbol',
        value: this.#lexSymbol(first),
      }
    }

    if (digits.has(first)) {
      let num = first;

      while (!this.#endOfFile()) {
        const next = this.#peek();
        if (number.has(next)) {
          num += next;
          this.#skip();
        } else {
          break;
        }
      }

      return {
        pos,
        kind: 'number',
        value: num,
      }
    }

    if (quotes.has(first)) {
      return {
        pos,
        kind: 'string',
        value: this.#lexString(first, pos),
      };
    }

    if (identifierStartTest.test(first)) {
      const word = this.#lexWord(first, pos);

      return {
        pos,
        kind: keywords.has(word) ? 'keyword': 'identifier',
        value: word
      }
    }

    return pos.fail(`Unknown character ${first}`);
  }

  #lexSymbol(first: string): string {
    // until we reach the end of the file, check for the next character
    while (!this.#endOfFile()) {
      const next = this.#peek();
      const maybe = first + next;

      // if the next char is an op, if there is an op that we could be building toward, take it and continue
      if (operatorSymbols.has(next) && operators.find(it => it.startsWith(maybe))) {
        first = maybe;
        this.#skip();
      } else {
        // otherwise return here with the op we have now
        return first;
      }
    }

    return first;
  }

  #lexString(quote: string, pos: Position): string {
    let result = '';

    while (!this.#endOfFile()) {
      const next = this.#next();

      if (next === '\\') {
        if (this.#endOfFile()) {
          pos.fail('Unterminated string starting');
        }
        result += '\\';
        result += this.#next();
      } else if (next === quote) {
        return result;
      } else {
        result += next;
      }
    }

    pos.fail('Unterminated string starting')
  }

  #lexWord(first: string, pos: Position): string {
    let word = first;

    while (!this.#endOfFile()) {
      const next = this.#peek();

      if (identifierTest.test(next)) {
        word += next;
        this.#skip();
      } else {
        return word;
      }
    }

    return word;
  }
}

export type Kind
  =
  | 'string'
  | 'number'
  | 'identifier'
  | 'symbol'
  | 'keyword'
  ;

export interface Token {
  pos: Position;
  kind: Kind;
  value: string;
}

export function isKind<Test extends Kind>(token: Token, test: Test): boolean {
  return token.kind === test;
}
