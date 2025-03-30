import { readFileSync } from 'node:fs';
import { Set } from 'immutable';
import { Position } from '../ast.ts';

const whitespace = Set(' \t\r\n');
const digits = Set('0123456789');
const number = digits.concat(Set('_.'));
const quotes = Set('\'"`');
const identifierStartTest = /^\p{L}$/u;
const identifierTest = /^[\p{L}_\d]$/u;
const keywords = Set.of(
  // the four expression types
  'const',
  'val',
  'var',
  'flow',
  // the three function types
  'fun',
  'def',
  'sig',

  // the data types
  'data',
  'enum',

  // protocols and methods
  'protocol',
  'implement',
  'for', // for comprehensions and protocol impls use this

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
  'external',
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

  #index = 0;
  #line = 1;
  #col = 1;

  private constructor(src: string, content: string) {
    this.#src = src;
    this.#content = content;
    this.#limit = content.length;
  }

  public static lexFile(path: string): Array<Token> {
    const content = readFileSync(path, {encoding: 'utf-8'});

    return new Lexer(path, content).#lexFile();
  }

  public static lexString(path: string, content: string): Array<Token> {
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
      return this.#content[this.#index]!;
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

  #skipComment(): boolean {
    const next = this.#content[this.#index]!;
    const nextNext = this.#content[this.#index + 1]!;

    if (next === '/' && nextNext === '/') {
      // skip line comment
      while (!this.#endOfFile() && this.#peek() !== '\n') {
        this.#skip();
      }
      this.#skip();
      return true;
    } else if (next === '/' && nextNext === '*') {
      // skip block comment
      this.#skip();
      this.#skip();
      while (!this.#endOfFile() && this.#content[this.#index] !== '*' && this.#content[this.#index + 1] !== '/') {
        this.#skip();
      }
      this.#skip();
      this.#skip();
      return true;
    } else {
      return !this.#endOfFile();
    }
  }

  #skipWhitespace(): boolean {
    // until we reach the end of the file, if the next char is whitespace, skip it
    while (this.#skipComment() && whitespace.has(this.#peek())) {
      this.#skip();
    }

    return !this.#endOfFile();
  }

  #lexFile(): Array<Token> {
    const tokens: Array<Token> = [];

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
      };
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
      };
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
        value: word,
      };
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

    pos.fail('Unterminated string starting');
  }

  #lexWord(first: string, _pos: Position): string {
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
