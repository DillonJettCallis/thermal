import {
  Access,
  AccessExpression,
  AssignmentStatement,
  BlockEx,
  BooleanLiteralEx,
  CallEx,
  ConstantDeclaration,
  ConstructExpression,
  Declaration,
  EnumDeclaration,
  Expression,
  File,
  FunctionDeclaration,
  FunctionStatement,
  IdentifierEx,
  IfEx,
  isAccess,
  IsExpression,
  isPhase,
  LambdaEx,
  NominalType,
  NumberLiteralEx,
  Parameter,
  ParameterizedType,
  Phase,
  Position,
  ResultType,
  ReturnEx,
  Statement,
  StaticAccessExpression,
  StringLiteralEx,
  StructDeclaration,
  TypeExpression,
  TypeParameter
} from "./ast";
import { isKind, Kind, Lexer, Token } from "./lexer";
import { Set } from 'immutable';

export class Parser {

  readonly #tokens: Array<Token>;
  readonly #limit: number;

  #index: number = 0;

  private constructor(tokens: Token[]) {
    this.#tokens = tokens;
    this.#limit = tokens.length;
  }

  static parseFile(path: string): File {
    return {
      src: path,
      declarations: new Parser(Lexer.lexFile(path)).#parseFile(),
    }
  }

  #endOfFile(): boolean {
    return this.#index === this.#limit;
  }

  #peek(): Token {
    if (this.#endOfFile()) {
      throw new Error('Out of bounds');
    } else {
      return this.#tokens[this.#index];
    }
  }

  #skip(): void {
    this.#index++;
  }

  #next(): Token {
    const result = this.#peek();
    this.#skip();
    return result;
  }

  #checkKind<Test extends Kind>(kind: Test): { pos: Position, kind: Test, value: string } | undefined {
    const next = this.#peek();

    if (isKind(next, kind)) {
      this.#skip();
      return next;
    } else {
      return undefined;
    }
  }

  #assertKind<Test extends Kind>(kind: Test): { pos: Position, kind: Test, value: string } {
    const next = this.#peek();

    if (isKind(next, kind)) {
      this.#skip();
      return next;
    } else {
      return next.pos.fail(`Expected token type '${kind}' but found ${next.kind}`);
    }
  }

  #checkKeyword(keyword: string): boolean {
    const next = this.#peek();

    if (isKind(next, 'keyword') && next.value === keyword) {
      this.#skip();
      return true;
    } else {
      return false;
    }
  }

  #assertKeyword(keyword: string): void {
    const next = this.#peek();

    if (isKind(next, 'keyword') && next.value === keyword) {
      this.#skip();
    } else {
      next.pos.fail(`Expected keyword ${keyword} but found ${next.kind} '${next.value}'`)
    }
  }

  #checkSymbol(symbol: string): boolean {
    const next = this.#peek();

    if (isKind(next, 'symbol') && next.value === symbol) {
      this.#skip();
      return true;
    } else {
      return false;
    }
  }

  #assertSymbol(symbol: string): void {
    const next = this.#peek();

    if (isKind(next, 'symbol') && next.value === symbol) {
      this.#skip();
    } else {
      next.pos.fail(`Expected symbol ${symbol} but found ${next.kind} '${next.value}'`)
    }
  }

  #parseFile(): Declaration[] {
    const decs: Declaration[] = [];
    // until we reach the end of the file

    while (!this.#endOfFile()) {
      decs.push(this.#parseDeclaration());
    }

    return decs;
  }

  #parseDeclaration(): Declaration {
    const first = this.#assertKind('keyword');
    const [access, keyword] = isAccess(first.value)
      ? [first.value, this.#assertKind('keyword')]
      : ['internal' as const, first];

    switch (keyword.value) {
      case 'const':
        return this.#parseConstDeclare(access, first.pos);
      case 'fun':
        return this.#parseFunctionDeclare(access, first.pos);
      case 'struct':
        return this.#parseStructDeclare(access, first.pos);
      case 'enum':
        return this.#parseEnumDeclare(access, first.pos);
      default:
        return first.pos.fail(`Expected declaration but found ${first.kind} '${first.value}'`);
    }
  }


  #parseConstDeclare(access: Access, pos: Position): ConstantDeclaration {
    // we've already parsed the 'const' keyword and the access modifier

    const nameToken = this.#assertKind('identifier');
    this.#assertSymbol(':');
    const expression = this.#parseExpression();

    return {
      pos,
      access,
      name: nameToken.value,
      expression,
    }
  }

  #parseFunctionDeclare(access: Access, pos: Position): FunctionDeclaration {
    const func = this.#parseFunctionStatement(pos);

    return {
      ...func,
      access,
      pos,
    };
  }

  #parseStructDeclare(access: Access, pos: Position): StructDeclaration {
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();

    this.#assertSymbol('{');
    const fields: { [key: string]: TypeExpression } = Object.fromEntries(this.#parseList('}', true, () => {
      const name = this.#assertKind('identifier').value;
      this.#assertSymbol(':');
      const type = this.#parseTypeExpression();
      return [name, type] as const;
    }));

    return {
      pos,
      access,
      name,
      typeParams,
      fields,
    }
  }

  #parseEnumDeclare(access: Access, pos: Position): EnumDeclaration {
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();
    this.#assertSymbol('{');
    const variants = Object.fromEntries(this.#parseList('}', true, () => {
      const name = this.#assertKind('identifier').value;
      const next = this.#assertKind('symbol');

      switch (next.value) {
        case '{': {
          const fields: { [key: string]: TypeExpression } = Object.fromEntries(this.#parseList('}', true, () => {
            const name = this.#assertKind('identifier').value;
            this.#assertSymbol(':');
            const type = this.#parseTypeExpression();
            return [name, type] as const;
          }));

          return [name, {fields}] as const;
        }
        case '(': {
          const fields: TypeExpression[] = this.#parseList(')', false, () => {
            return this.#parseTypeExpression();
          });
          return [name, {fields}];
        }
        case ':':
          return [name, {type: this.#parseTypeExpression()} as const];
        default:
          return next.pos.fail(`Expected enum variant but found symbol '${next.value}'`);
      }
    }));

    return {
      pos,
      access,
      name,
      typeParams,
      variants,
    }
  }

  #parseFunctionStatement(pos: Position): FunctionStatement {
    // the word 'fun' has already been parsed by this point
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();
    this.#assertSymbol('(');
    const params = this.#parseList(')', false, () => {
      const first = this.#next();

      if (first.kind === 'keyword' && isPhase(first.value)) {
        const phase = first.value;
        const name = this.#assertKind('identifier').value;
        this.#assertSymbol(':');
        const type = this.#parseTypeExpression();
        return {
          pos: first.pos,
          phase,
          name,
          type,
        } satisfies Parameter;
      } else if (first.kind === 'identifier') {
        const name = first.value;
        this.#assertSymbol(':');
        const type = this.#parseTypeExpression();
        return {
          pos: first.pos,
          phase: undefined,
          name,
          type,
        } satisfies Parameter;
      } else {
        return first.pos.fail(`Expected parameter, found ${first.kind} '${first.value}'`);
      }
    });
    this.#assertSymbol(':');
    const resultType = this.#parseResultType();

    const final = this.#assertKind('symbol');
    const body = final.value === '='
      ? this.#parseExpression()
      : final.value === '{'
        ? this.#parseBlockExpression(final.pos)
        : final.pos.fail('Expected function body');

    return {
      kind: 'function',
      pos,
      name,
      typeParams,
      params,
      resultType,
      body,
    }
  }

  #parseExpression(): Expression {
    const first = this.#peek();

    if (first.kind === 'symbol' && first.value === '{') {
      this.#skip();
      if (this.#checkLambda(first.pos)) {
        return this.#parseLambda(first.pos);
      } else {
        return this.#parseBlockExpression(first.pos);
      }
    } else if (first.kind === 'keyword' && first.value === 'if') {
      this.#skip();
      return this.#parseIfExpression(first.pos);
    } else if (first.kind === 'keyword' && first.value === 'return') {
      this.#skip();
      return this.#parseReturnExpression(first.pos);
    } else {
      return this.#parseBinaryExpression();
    }
  }

  // after parsing a brace, this code will figure out of this is a lambda or a block
  #checkLambda(pos: Position): boolean {
    let depth = 1;

    for (let i = this.#index + 1; i < this.#limit; i++) {
      const next = this.#tokens[i];
      if (next.kind === 'symbol') {
        switch (next.value) {
          case '{':
            ++depth;
            break;
          case '}':
            if (--depth === 0) {
              return false;
            }
            break;
          case '=>':
            if (depth === 0) {
              return true
            }
        }
      }
    }

    pos.fail('Unclosed brace starting');
  }

  #parseLambda(pos: Position): LambdaEx {
    // the opening { has already been parsed
    return {
      pos,
      kind: 'function',
      params: this.#parseList('=>', false, () => {
        const name = this.#assertKind('identifier');

        if (this.#checkSymbol(':')) {
          return {
            pos: name.pos,
            phase: undefined,
            name: name.value,
            type: this.#parseTypeExpression(),
          } satisfies Parameter;
        } else {
          return {
            pos: name.pos,
            phase: undefined,
            name: name.value,
            type: undefined,
          } satisfies Parameter;
        }
      }),
      body: this.#parseBlockExpression(pos),
    }
  }

  #parseIfExpression(pos: Position): IfEx {
    // the 'if' has already been parsed
    this.#assertSymbol('(');
    const condition = this.#parseExpression();
    this.#assertSymbol(')');
    const thenEx = this.#parseExpression();
    const elseEx = this.#checkKeyword('else')
      ? this.#parseExpression()
      : undefined;

    return {
      pos,
      kind: 'if',
      condition,
      thenEx,
      elseEx,
    }
  }

  #parseReturnExpression(pos: Position): ReturnEx {
    // the 'return' has already been parsed
    return {
      pos,
      kind: 'return',
      expression: this.#parseExpression(),
    }
  }

  #parseBinaryExpression(): Expression {
    const start = this.#parseIsExpression.bind(this);
    const prod = this.#parseBinaryExpSet(Set.of('*', '/'), start);
    const sum = this.#parseBinaryExpSet(Set.of("+", "-"), prod)
    const compare = this.#parseBinaryExpSet(Set.of(">", ">=", "<", "<="), sum)
    const equal = this.#parseBinaryExpSet(Set.of("==", "!="), compare)
    const and = this.#parseBinaryExpSet(Set.of("&&"), equal)
    const or = this.#parseBinaryExpSet(Set.of("||"), and)
    return or()
  }

  #parseBinaryExpSet(ops: Set<string>, tail: () => Expression): () => Expression {
    const recurse = (): Expression => {
      const left = tail();

      if (this.#endOfFile()) {
        return left;
      }

      const next = this.#peek();

      if (ops.has(next.value)) {
        return {
          pos: next.pos,
          kind: 'call',
          func: {
            pos: next.pos,
            kind: 'identifier',
            name: next.value,
          } satisfies IdentifierEx,
          typeArgs: undefined,
          args: [
            left,
            recurse(),
          ]
        } satisfies CallEx;
      } else {
        return left;
      }
    };

    return recurse;
  }

  #parseIsExpression(): Expression {
    const base = this.#parseCallExpression();
    const next = this.#peek();

    if (next.value === 'is' || next.value === '!is') {

      return {
        pos: next.pos,
        kind: 'is',
        not: next.value === '!is',
        base,
        type: this.#parseTypeExpression(),
      } satisfies IsExpression;
    } else {
      return base;
    }
  }

  #parseCallExpression(): Expression {
    const base = this.#parseConstruct();
    const typeArgs = this.#parseFunctionTypeArguments();

    if (this.#checkSymbol('(')) {
      const args = this.#parseList(')', false, () => this.#parseExpression());

      return {
        pos: base.pos,
        kind: 'call',
        func: base,
        typeArgs: undefined,
        args,
      } satisfies CallEx;
    } else {
      if (typeArgs !== undefined) {
        base.pos.fail('Found generics but no function call');
      }

      return base;
    }
  }

  #parseFunctionTypeArguments(): TypeExpression[] | undefined {
    if (this.#checkSymbol('[')) {
      return this.#parseList(']', false, () => this.#parseTypeExpression());
    } else {
      return undefined;
    }
  }

  #parseConstruct(): Expression {
    const base = this.#parseAccessExpression();

    if (this.#checkSymbol('{')) {
      const fields = this.#parseList('}', true, () => {
        const name = this.#assertKind('identifier');

        if (this.#checkSymbol(':')) {
          const value = this.#parseExpression();

          return {
            name: name.value,
            value,
          } satisfies { name: string, value: Expression };
        } else {
          return {
            name: name.value,
            value: {
              pos: name.pos,
              kind: 'identifier',
              name: name.value,
            }
          } satisfies { name: string, value: IdentifierEx };
        }
      });

      return {
        pos: base.pos,
        kind: 'construct',
        base,
        fields,
      } satisfies ConstructExpression;
    } else {
      return base;
    }
  }

  #parseAccessExpression(): Expression {
    let base = this.#parseStaticAccessExpression();

    while (this.#checkSymbol('.')) {
      const field = this.#assertKind('identifier');
      base = {
        pos: field.pos,
        kind: 'access',
        base,
        field: {
          pos: field.pos,
          kind: 'identifier',
          name: field.value,
        },
      } satisfies AccessExpression;
    }

    return base;
  }

  #parseStaticAccessExpression(): Expression {
    let base = this.#parseTerm();

    if (base.kind === 'identifier' && this.#checkSymbol('::')) {
      const path = [] as IdentifierEx[];

      do {
        const field = this.#assertKind('identifier');

        path.push({
          pos: field.pos,
          kind: 'identifier',
          name: field.value,
        });
      } while (this.#checkSymbol('::'));

      return {
        pos: base.pos,
        kind: 'staticAccess',
        path,
      } satisfies StaticAccessExpression;
    }

    return base;
  }

  #parseTerm(): Expression {
    const next = this.#next();

    if (next.kind === 'string') {
      return {
        pos: next.pos,
        kind: 'stringLiteral',
        value: next.value,
      } satisfies StringLiteralEx;
    } else if (next.kind === 'number') {
      return {
        pos: next.pos,
        kind: 'numberLiteral',
        value: next.value,
      } satisfies NumberLiteralEx;
    } else if (next.kind === 'keyword' && (next.value === 'true' || next.value === 'false')) {
      return {
        pos: next.pos,
        kind: 'booleanLiteral',
        value: next.value === 'true',
      } satisfies BooleanLiteralEx;
    } else if (next.kind === 'identifier') {
      return {
        pos: next.pos,
        kind: 'identifier',
        name: next.value,
      } satisfies IdentifierEx;
    } else {
      return next.pos.fail(`Expected term, found ${next.kind} '${next.value}'`);
    }
  }

  #parseBlockExpression(pos: Position): BlockEx {
    // the opening brace has already been parsed
    const body = [] as Statement[];

    while (!this.#checkSymbol('}')) {
      const first = this.#peek();

      if (first.kind === 'symbol' && first.value === ';') {
        // do nothing
      } else if (first.kind === 'keyword' && first.value === 'fun') {
        this.#skip();
        body.push(this.#parseFunctionStatement(pos));
      } else if (first.kind === 'keyword' && isPhase(first.value)) {
        this.#skip();
        body.push(this.#parseAssignment(first.value, pos));
      } else {
        const expression = this.#parseExpression();
        body.push({
          kind: 'expression',
          pos,
          expression,
        })
      }
    }

    return {
      pos,
      kind: 'block',
      body,
    }
  }

  #parseAssignment(phase: Phase, pos: Position): AssignmentStatement {
    // the initial keyword has already been parsed
    const name = this.#assertKind('identifier').value;
    const type = this.#checkSymbol(':')
      ? this.#parseTypeExpression()
      : undefined;

    this.#assertSymbol('=');
    const expression = this.#parseExpression();

    return {
      kind: 'assignment',
      pos,
      phase,
      name,
      type,
      expression,
    };
  }

  /**
   * Parse a comma seperated list of anything
   */
  #parseList<Item>(close: string, trailingComma: boolean, parseItem: () => Item): Item[] {
    const items = [] as Item[];

    while (!this.#checkSymbol(close)) {
      items.push(parseItem());
      const next = this.#assertKind('symbol');

      switch (next.value) {
        // if we find a comma there might be another item, so continue
        case ',':
          if (!trailingComma && this.#checkSymbol(close)) {
            // if we do NOT allow trailing commas, but the next item is the close, fail
            next.pos.fail('Expected next item in list but found trailing comma');
          }
          break;
        // we hit the end of the list, leave
        case close:
          return items;
        default:
          // anything besides a comma or close is an error
          next.pos.fail(`Expected either , or ${close}`);
      }
    }

    return items;
  }

  #parseTypeParams(): TypeParameter[] {
    if (this.#checkSymbol('[')) {
      return this.#parseList(']', false, () => this.#parseTypeParam());
    } else {
      return [] as TypeParameter[];
    }
  }

  #parseTypeParam(): TypeParameter {
    const { pos, value: name } = this.#assertKind('identifier');

    if (this.#checkSymbol(':')) {
      const type = this.#parseTypeExpression();

      return {
        pos,
        name,
        bound: {
          constraint: 'invariant',
          type,
        }
      } satisfies TypeParameter
    } else if (this.#checkSymbol('<')) {
      const type = this.#parseTypeExpression();

      return {
        pos,
        name,
        bound: {
          constraint: 'covariant',
          type,
        }
      } satisfies TypeParameter
    } else if (this.#checkSymbol('>')) {
      const type = this.#parseTypeExpression();

      return {
        pos,
        name,
        bound: {
          constraint: 'contravariant',
          type,
        }
      } satisfies TypeParameter
    } else {
      return {
        pos,
        name,
        bound: undefined,
      } satisfies TypeParameter
    }
  }

  #parseTypeExpression(): TypeExpression {
    return this.#parseFunctionTypeExpression();
  }

  #parseFunctionTypeExpression(): TypeExpression {
    const pos = this.#peek().pos;

    if (this.#checkSymbol('{')) {
      const params = this.#parseList('=>', false, () => this.#parseTypeExpression());
      const result = this.#parseResultType();
      this.#assertSymbol('}');
      return {
        pos,
        kind: 'function',
        params,
        result,
      }
    } else {
      return this.#parseParameterizedTypeExpression();
    }
  }

  #parseParameterizedTypeExpression(): TypeExpression {
    const base = this.#parseNominalTypeExpression();

    if (this.#checkSymbol('[')) {
      const args = this.#parseList(']', false, () => this.#parseTypeExpression());

      return {
        pos: base.pos,
        kind: 'parameterized',
        base,
        args,
      } satisfies ParameterizedType;
    } else {
      return base;
    }
  }

  #parseNominalTypeExpression(): NominalType {
    const name = this.#assertKind('identifier');

    return {
      pos: name.pos,
      kind: 'nominal',
      name: name.value,
    }
  }

  #parseResultType(): ResultType {
    const next = this.#peek();

    if (next.kind === 'keyword' && isPhase(next.value)) {
      this.#skip();
      return {
        phase: next.value,
        type: this.#parseTypeExpression(),
      } satisfies ResultType;
    } else {
      return {
        phase: undefined,
        type: this.#parseTypeExpression(),
      } satisfies ResultType;
    }
  }
}