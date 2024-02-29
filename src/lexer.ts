import { Position } from './ast';
import { readFileSync } from 'node:fs';
import { Set } from 'immutable';

export class Lexer {

  static #whitespace = Set(' \t\r\n');
  static #uniqueSymbols = Set('(){}[],;+-*/.');
  static #symbols = Lexer.#uniqueSymbols.concat('=<>&|!:');
  static #digits = Set('0123456789');
  static #number = Lexer.#digits.concat('_.');
  static #quotes = Set('\'"`');
  static #identifierStartTest = /^[\p{L}_]$/u;
  static #identifierTest = /^[\p{L}_\d]$/u;
  static #keywords = Set.of(
    'const',
    'val',
    'var',
    'def',
    'sig',
    'fun',
    'struct',
    'true',
    'false',
    'return',
    'if',
    'else',
    'is',
    'import',
    'export',
    'public',
    'private',
    'protected',
  );

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

  #pos(): Position {
    return new Position(this.#src, this.#line, this.#col);
  }

  #endOfFile(): boolean {
    return this.#index > this.#limit;
  }

  #peek(): string {
    if (this.#endOfFile()) {
      throw new Error('Out of bounds');
    } else {
      return this.#content[this.#index];
    }
  }

  #skip(): void {
    this.#index++;
    if (this.#peek() == '\n') {
      this.#line++;
      this.#col = 1;
    } else {
      this.#col++;
    }
  }

  #next(): string {
    const next = this.#peek();
    this.#skip();
    return next;
  }

  #skipWhitespace(): boolean {
    // until we reach the end of the file, if the next char is whitespace, skip it
    while (!this.#endOfFile() && Lexer.#whitespace.has(this.#peek())) {
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
    const first = this.#peek();

    if (Lexer.#symbols.has(first)) {
      this.#skip();

      return {
        pos,
        kind: 'symbol',
        value: this.#lexSymbol(first, pos),
      }
    }

    if (Lexer.#digits.has(first)) {
      this.#skip();
      let num = first;

      while (!this.#endOfFile()) {
        const next = this.#peek();
        if (Lexer.#number.has(next)) {
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

    if (Lexer.#quotes.has(first)) {
      this.#skip();
      return {
        pos,
        kind: 'string',
        value: this.#lexString(first, pos),
      };
    }

    if (Lexer.#identifierStartTest.test(first)) {
      const word = this.#lexWord(first, pos);

      return {
        pos,
        kind: Lexer.#keywords.has(word) ? 'keyword': 'identifier',
        value: word
      }
    }

    return pos.fail(`Unknown character ${first}`);
  }

  #lexSymbol(first: string, pos: Position): string {
    if (this.#endOfFile()) {
      return first;
    }

    if (Lexer.#uniqueSymbols.has(first)) {
      return first;
    }

    if (first === '<' || first === '>') {
      const next = this.#peek();

      if (next == '=') {
        this.#skip();

        if (!this.#endOfFile()) {
          const last = this.#peek();

          if (last === '>' || last === '<' || last === '=') {
            pos.fail(`Invalid operator '${first}${next}${last}'`);
          }
        }

        return first + next;
      } else {
        return first;
      }
    }

    if (first === '!') {
      const next = this.#peek();

      if (next === '=') {
        this.#skip();

        if (!this.#endOfFile()) {
          const last = this.#peek();

          if (last === '!' || last === '=') {
            pos.fail(`Invalid operator '${first}${next}${last}'`);
          }
        }

        return '!=';
      } else if (next === 'i' && this.#src[this.#index + 1] === 's') {
        this.#skip();
        this.#skip();
        return '!is';
      } {
        return '!';
      }
    }

    if (first === '=') {
      const next = this.#peek();

      if (next === '=' || next === '>') {
        this.#skip();

        if (!this.#endOfFile()) {
          const last = this.#peek();

          if (last === '=' || last === '>' || last === '<' || last === '!') {
            pos.fail(`Invalid operator '${first}${next}${last}'`);
          }
        }

        return first + next;
      } else {
        return '!';
      }
    }

    if (first === '&' || first === '|') {
      const next = this.#peek();

      if (next === first) {
        this.#skip();

        if (!this.#endOfFile()) {
          const last = this.#peek();

          if (last === '&' || last === '|') {
            pos.fail(`Invalid operator '${first}${next}${last}'`);
          }
        }

        return first + next;
      } else {
        if (first === '&') {
          pos.fail(`Invalid operator '&'`);
        } else {
          return '|';
        }
      }
    }

    if (first === ':') {
      const next = this.#peek();

      if (next === ':') {
        this.#skip();

        return '::';
      } else {
        return ':';
      }
    }

    pos.fail(`Invalid operator '${first}'`);
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

      if (Lexer.#identifierTest.test(next)) {
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

export function isKind<Test extends Kind>(token: Token, test: Test): token is { pos: Position; kind: Test; value: string; } {
  return token.kind === test;
}
