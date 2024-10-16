import {
  Access,
  AccessExpression,
  AndExpression,
  AssignmentStatement,
  BlockEx,
  BooleanLiteralEx,
  CallEx,
  ConstantDeclaration,
  ConstructExpression,
  ConstructFieldExpression,
  Declaration,
  EnumAtomVariant,
  EnumDeclaration,
  EnumStructVariant,
  EnumTupleVariant,
  Expression,
  ExpressionPhase,
  File,
  FloatLiteralEx,
  FunctionDeclaration,
  FunctionPhase,
  FunctionStatement,
  IdentifierEx,
  IfEx,
  ImportDeclaration,
  ImportExpression,
  IntLiteralEx,
  isAccess,
  IsExpression,
  isExpressionPhase,
  isFunctionPhase,
  LambdaEx,
  ListLiteralEx,
  MapLiteralEx,
  NominalImportExpression,
  NotExpression,
  OrExpression,
  Position,
  ReturnEx,
  SetLiteralEx,
  Statement,
  StaticAccessExpression,
  StringLiteralEx,
  StructDeclaration,
  StructField,
  Symbol,
  UncheckedFunctionTypeParameter,
  UncheckedNominalType,
  UncheckedParameter,
  UncheckedParameterizedType,
  UncheckedTypeExpression,
  UncheckedTypeParameterType
} from "./ast.js";
import { isKind, Kind, Lexer, Token } from "./lexer.js";
import { Map, Seq, Set } from 'immutable';

export class Parser {

  readonly #tokens: Array<Token>;
  readonly #limit: number;
  readonly #module: Symbol;

  #index: number = 0;

  private constructor(tokens: Token[], module: Symbol) {
    this.#tokens = tokens;
    this.#limit = tokens.length;
    this.#module = module;
  }

  static parseFile(path: string, module: Symbol): File {
    return {
      src: path,
      module,
      declarations: new Parser(Lexer.lexFile(path), module).#parseFile(),
    }
  }

  static parseExpression(path: string, content: string, module: Symbol): Expression {
    return new Parser(Lexer.lexString(path, content), module).#parseExpression();
  }

  #endOfFile(): boolean {
    return this.#index === this.#limit;
  }

  #peek(): Token {
    if (this.#endOfFile()) {
      throw new Error('Out of bounds');
    } else {
      return this.#tokens[this.#index]!!;
    }
  }

  #skip(): void {
    this.#index++;
  }

  #prev(): Token {
    if (this.#index === 0) {
      throw new Error('Out of bounds');
    } else {
      return this.#tokens[this.#index - 1]!!;
    }
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
      return next as { pos: Position, kind: Test, value: string };
    } else {
      return undefined;
    }
  }

  #assertKind<Test extends Kind>(kind: Test): { pos: Position, kind: Test, value: string } {
    const next = this.#peek();

    if (isKind(next, kind)) {
      this.#skip();
      return next as { pos: Position, kind: Test, value: string };
    } else {
      return next.pos.fail(`Expected token type '${kind}' but found ${next.kind} '${next.value}'`);
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
    if (this.#endOfFile()) {
      return false;
    }

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

      // skip semi-colons
      while (!this.#endOfFile() && this.#peek().value === ';') {
        this.#skip();
      }
    }

    return decs;
  }

  #parseDeclaration(): Declaration {
    const first = this.#assertKind('keyword');

    if (first.value === 'import') {
      return this.#parseImportDeclare(first.pos);
    }

    const extern = this.#checkKeyword('extern');

    const [access, keyword] = isAccess(first.value)
      ? [first.value, this.#assertKind('keyword')]
      : ['internal' as const, first];

    switch (keyword.value) {
      case 'const':
        if (extern) {
          keyword.pos.fail(`Structs cannot be 'extern'`);
        }
        return this.#parseConstDeclare(access, first.pos);
      case 'fun':
      case 'def':
      case 'sig':
        return this.#parseFunctionDeclare(extern, access, keyword.value, first.pos);
      case 'struct':
        if (extern) {
          keyword.pos.fail(`Structs cannot be 'extern'`);
        }
        return this.#parseStructDeclare(access, first.pos);
      case 'enum':
        if (extern) {
          keyword.pos.fail(`Enums cannot be 'extern'`);
        }
        return this.#parseEnumDeclare(access, first.pos);
      case 'import':
      default:
        return first.pos.fail(`Expected declaration but found ${first.kind} '${first.value}'`);
    }
  }

  #parseImportDeclare(pos: Position): ImportDeclaration {
    // we've already parsed the 'import' keyword
    const pack = this.#parseNominalImport();
    this.#assertSymbol('/');
    const ex = this.#parseImportExpression();

    return {
      pos,
      kind: 'import',
      package: pack,
      ex,
    }
  }

  #parseImportExpression(): ImportExpression {
    const base = this.#parseNominalImport();

    if (this.#checkSymbol('::')) {
      if (this.#checkSymbol('{')) {
        return {
          pos: base.pos,
          kind: 'nested',
          base,
          children: this.#parseList('}', true, () => this.#parseImportExpression()),
        }
      } else {
        return {
          pos: base.pos,
          kind: 'nested',
          base,
          children: [this.#parseImportExpression()],
        }
      }
    } else {
      return base;
    }
  }

  #parseNominalImport(): NominalImportExpression {
    const name = this.#assertKind('identifier');

    return {
      pos: name.pos,
      kind: 'nominal',
      name: name.value,
    };
  }

  #parseConstDeclare(access: Access, pos: Position): ConstantDeclaration {
    // we've already parsed the 'const' keyword and the access modifier

    const nameToken = this.#assertKind('identifier');
    this.#assertSymbol(':');
    const type = this.#parseTypeExpression();
    this.#assertSymbol('=');
    const expression = this.#parseExpression();

    return {
      pos,
      kind: 'const',
      access,
      symbol: this.#module.child(nameToken.value),
      name: nameToken.value,
      type,
      expression,
    }
  }

  #parseFunctionDeclare(extern: boolean, access: Access, phase: FunctionPhase, pos: Position): FunctionDeclaration {
    const func = this.#parseFunctionStatement(phase, pos);

    return {
      ...func,
      extern,
      access,
      symbol: this.#module.child(func.name),
      pos,
    };
  }

  #parseStructDeclare(access: Access, pos: Position): StructDeclaration {
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();

    this.#assertSymbol('{');
    const fields: Map<string, StructField> = Map(this.#parseList('}', true, () => this.#parseStructField()));

    return {
      pos,
      kind: 'struct',
      access,
      symbol: this.#module.child(name),
      name,
      typeParams,
      fields,
    }
  }

  #parseEnumDeclare(access: Access, pos: Position): EnumDeclaration {
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();
    this.#assertSymbol('{');
    const symbol = this.#module.child(name);

    const variants = Seq(this.#parseList('}', true, () => {
      const nameToken = this.#assertKind('identifier');
      const name = nameToken.value;
      const pos = nameToken.pos;
      const next = this.#assertKind('symbol');

      switch (next.value) {
        case '{': {
          const fields: Map<string, StructField> = Map(this.#parseList('}', true, () => this.#parseStructField()));

          return [name, { pos, kind: 'struct', symbol: symbol.child(name), fields } satisfies EnumStructVariant] as const;
        }
        case '(': {
          const fields: UncheckedTypeExpression[] = this.#parseList(')', false, () => {
            return this.#parseTypeExpression();
          });
          return [name, { pos, kind: 'tuple', fields, symbol: symbol.child(name) } satisfies EnumTupleVariant] as const;
        }
        default:
          return [name, { pos, kind: 'atom', symbol: symbol.child(name) } satisfies EnumAtomVariant] as const;
      }
    })).toKeyedSeq()
      .mapKeys((_, pair) => pair[0])
      .map(pair => pair[1])
      .toMap();

    return {
      pos,
      kind: 'enum',
      access,
      symbol,
      name,
      typeParams,
      variants,
    }
  }

  #parseStructField(): [string, StructField] {
    const name = this.#assertKind('identifier').value;
    this.#assertSymbol(':');
    const type = this.#parseTypeExpression();

    const defaultEx = this.#checkSymbol('=')
      ? this.#parseExpression()
      : undefined;

    return [
      name,
      {
        type,
        default: defaultEx,
      }
    ]
  }

  #parseFunctionStatement(phase: FunctionPhase, pos: Position): FunctionStatement {
    // the word 'fun' has already been parsed by this point
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();
    this.#assertSymbol('(');
    const params = this.#parseList(')', false, () => {
      const first = this.#next();

      if (first.kind === 'keyword' && isExpressionPhase(first.value)) {
        const phase = first.value;
        const name = this.#assertKind('identifier').value;
        this.#assertSymbol(':');
        const type = this.#parseTypeExpression();
        return {
          pos: first.pos,
          phase,
          name,
          type,
        } satisfies UncheckedParameter;
      } else if (first.kind === 'identifier') {
        const name = first.value;
        this.#assertSymbol(':');
        const type = this.#parseTypeExpression();
        return {
          pos: first.pos,
          phase: undefined,
          name,
          type,
        } satisfies UncheckedParameter;
      } else {
        return first.pos.fail(`Expected parameter, found ${first.kind} '${first.value}'`);
      }
    });
    this.#assertSymbol(':');
    const resultType = this.#parseTypeExpression();

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
      phase,
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
      return this.#parseBlockExpression(first.pos);
    } else if (first.kind === 'keyword' && isFunctionPhase(first.value)) {
      this.#skip();
      return this.#parseLambda(first.value, first.pos);
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

  #parseLambda(phase: FunctionPhase, pos: Position): LambdaEx {
    // the opening phase has already been parsed
    this.#assertSymbol('{');

    return {
      pos,
      kind: 'function',
      phase,
      params: this.#parseList('=>', false, () => {
        const first = this.#next();
        const [phase, name] = isExpressionPhase(first.value)
          ? [first.value, this.#assertKind('identifier')]
          : [undefined, first];

        if (this.#checkSymbol(':')) {
          return {
            pos: name.pos,
            phase,
            name: name.value,
            type: this.#parseTypeExpression(),
          } satisfies UncheckedParameter;
        } else {
          return {
            pos: name.pos,
            phase,
            name: name.value,
            type: undefined,
          } satisfies UncheckedParameter;
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
    const and = this.#parseBinaryExpSet(Set.of("&&"), equal, (pos, left, right) => {
      return {
        pos,
        kind: 'and',
        left,
        right,
      } satisfies AndExpression;
    });
    const or = this.#parseBinaryExpSet(Set.of("||"), and, (pos, left, right) => {
      return {
        pos,
        kind: 'or',
        left,
        right,
      } satisfies OrExpression;
    });
    return or()
  }

  #parseBinaryExpSet(ops: Set<string>, tail: () => Expression, handler?: (pos: Position, left: Expression, right: Expression) => Expression): () => Expression {
    const recurse = (): Expression => {
      const left = tail();

      if (this.#endOfFile()) {
        return left;
      }

      const next = this.#peek();

      if (ops.has(next.value)) {
        this.#skip();
        const right = recurse();

        if (handler !== undefined) {
          return handler(next.pos, left, right);
        }

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
            right,
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

    if (this.#endOfFile()) {
      return base;
    }

    const next = this.#peek();

    if (next.value === 'is' || next.value === '!is') {

      return {
        pos: next.pos,
        kind: 'is',
        not: next.value === '!is',
        base,
        check: this.#parseTypeExpression(),
      } satisfies IsExpression;
    } else {
      return base;
    }
  }

  #parseCallExpression(): Expression {
    const base = this.#parseConstruct();
    const typeArgs = this.#parseFunctionTypeArguments();

    if (this.#checkSymbol('(')) {
      const args = this.#parseList(')', true, () => this.#parseExpression());

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

  #parseFunctionTypeArguments(): UncheckedTypeExpression[] | undefined {
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
            pos: name.pos,
            name: name.value,
            value,
          } satisfies ConstructFieldExpression;
        } else {
          return {
            pos: name.pos,
            name: name.value,
            value: {
              pos: name.pos,
              kind: 'identifier',
              name: name.value,
            }
          } satisfies ConstructFieldExpression;
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
    let base = this.#parseCollectionLiteral();

    while (this.#checkSymbol('.')) {
      const pos = this.#prev().pos;
      const field = this.#assertKind('identifier');
      base = {
        pos,
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

  #parseCollectionLiteral(): Expression {
    const next = this.#peek();

    switch (next.value) {
      case '[':
        this.#skip();
        return {
          pos: next.pos,
          kind: 'list',
          values: this.#parseList(']', true, () => this.#parseExpression()),
        } satisfies ListLiteralEx;
      case '%[':
        this.#skip();
        return {
          pos: next.pos,
          kind: 'set',
          values: this.#parseList(']', true, () => this.#parseExpression()),
        } satisfies SetLiteralEx;
      case '#[':
        this.#skip();
        return {
          pos: next.pos,
          kind: 'map',
          values: this.#parseList(']', true, () => {
            const key = this.#parseExpression();
            this.#assertSymbol(':');
            const value = this.#parseExpression();
            return {
              key,
              value,
            };
          }),
        } satisfies MapLiteralEx;
      default:
        return this.#parseNot();
    }
  }

  #parseNot(): Expression {
    const next = this.#peek();

    if (next.value === '!') {
      this.#skip();

      return {
        pos: next.pos,
        kind: 'not',
        base: this.#parseNegate(),
      } satisfies NotExpression;
    } else {
      return this.#parseNegate();
    }
  }

  #parseNegate(): Expression {
    const next = this.#peek();

    if (next.value === '-') {
      this.#skip();

      return {
        pos: next.pos,
        kind: 'call',
        func: {
          pos: next.pos,
          kind: 'staticAccess',
          path: [
            {
              pos: next.pos,
              kind: 'identifier',
              name: 'core'
            }, {
              pos: next.pos,
              kind: 'identifier',
              name: 'math'
            }, {
              pos: next.pos,
              kind: 'identifier',
              name: 'negate'
            }
          ],
        } satisfies StaticAccessExpression,
        typeArgs: [],
        args: [
          this.#parseStaticAccessExpression(),
        ],
      } satisfies CallEx;
    } else {
      return this.#parseStaticAccessExpression();
    }
  }

  #parseStaticAccessExpression(): Expression {
    let base = this.#parseTerm();

    if (base.kind === 'identifier' && this.#checkSymbol('::')) {
      const path = [base] as IdentifierEx[];
      const pos = this.#prev().pos;

      do {
        const field = this.#assertKind('identifier');

        path.push({
          pos: field.pos,
          kind: 'identifier',
          name: field.value,
        });
      } while (this.#checkSymbol('::'));

      return {
        pos,
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
      // TODO: there is more to number literals than this
      const num = Number.parseFloat(next.value)

      if (Number.isSafeInteger(num)) {
        return {
          pos: next.pos,
          kind: 'intLiteral',
          value: num,
        } satisfies IntLiteralEx;
      } else {
        return {
          pos: next.pos,
          kind: 'floatLiteral',
          value: num,
        } satisfies FloatLiteralEx;
      }
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

  static readonly #reassignmentOps = Set.of('=', '+=', '-=', '*=', '/=');

  #parseBlockExpression(pos: Position): BlockEx {
    // the opening brace has already been parsed
    const body = [] as Statement[];

    while (!this.#checkSymbol('}')) {
      const first = this.#peek();

      if (first.kind === 'symbol' && first.value === ';') {
        // do nothing
        this.#skip();
      } else if (first.kind === 'keyword' && isFunctionPhase(first.value)) {
        this.#skip();
        body.push(this.#parseFunctionStatement(first.value, pos));
      } else if (first.kind === 'keyword' && isExpressionPhase(first.value)) {
        this.#skip();
        body.push(this.#parseAssignment(first.value, pos));
      } else {
        const expression = this.#parseExpression();
        const possibleAssignment = this.#peek();

        if (expression.kind === 'identifier' && possibleAssignment.kind === 'symbol' && Parser.#reassignmentOps.has(possibleAssignment.value)) {
          this.#skip();
          const content = this.#parseExpression();

          if (possibleAssignment.value === '=') {
            body.push({
              kind: 'reassignment',
              pos,
              name: expression.name,
              expression: content,
            })
          } else {
            // desugar +=, -=, *= and /= into normal assignments calling their operator functions
            body.push({
              kind: 'reassignment',
              pos,
              name: expression.name,
              expression: {
                kind: 'call',
                pos: possibleAssignment.pos,
                func: {
                  kind: 'identifier',
                  pos: possibleAssignment.pos,
                  name: possibleAssignment.value[0]!!,
                },
                typeArgs: undefined,
                args: [
                  expression,
                  content,
                ]
              },
            });
          }


        } else {
          body.push({
            kind: 'expression',
            pos,
            expression,
          });
        }
      }
    }

    return {
      pos,
      kind: 'block',
      body,
    }
  }

  #parseAssignment(phase: ExpressionPhase, pos: Position): AssignmentStatement {
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

  #parseTypeParams(): UncheckedTypeParameterType[] {
    if (this.#checkSymbol('<')) {
      return this.#parseList('>', false, () => {
        const id = this.#assertKind('identifier');

        return {
          pos: id.pos,
          kind: 'typeParameter',
          name: id.value,
        } satisfies UncheckedTypeParameterType;
      });
    } else {
      return [] as UncheckedTypeParameterType[];
    }
  }

  #functionTypeParameter(): UncheckedFunctionTypeParameter {
    const next = this.#peek();

    if (next.kind === 'keyword' && isExpressionPhase(next.value)) {
      this.#skip();
      return {
        pos: next.pos,
        phase: next.value,
        type: this.#parseFunctionTypeExpression(),
      }
    } else {
      return {
        pos: next.pos,
        phase: undefined,
        type: this.#parseFunctionTypeExpression(),
      }
    }
  }

  #parseTypeExpression(): UncheckedTypeExpression {
    return this.#parseFunctionTypeExpression();
  }

  #parseFunctionTypeExpression(): UncheckedTypeExpression {
    const next = this.#peek();

    if (next.kind === 'keyword' && isFunctionPhase(next.value)) {
      this.#skip();
      this.#assertSymbol('{');
      const params = this.#parseList('->', false, () => this.#functionTypeParameter());
      const result = this.#parseTypeExpression();
      this.#assertSymbol('}');
      return {
        pos: next.pos,
        kind: 'function',
        phase: next.value,
        params,
        result,
      }
    } else if (this.#checkSymbol('{')) {
      const params = this.#parseList('->', false, () => this.#functionTypeParameter());
      const result = this.#parseTypeExpression();
      this.#assertSymbol('}');
      return {
        pos: next.pos,
        kind: 'function',
        phase: 'fun',
        params,
        result,
      }
    } else {
      return this.#parseParameterizedTypeExpression();
    }
  }

  #parseParameterizedTypeExpression(): UncheckedTypeExpression {
    const base = this.#parseNominalTypeExpression();

    if (this.#checkSymbol('<')) {
      const args = this.#parseList('>', false, () => this.#parseTypeExpression());

      return {
        pos: base.pos,
        kind: 'parameterized',
        base,
        args,
      } satisfies UncheckedParameterizedType;
    } else {
      return base;
    }
  }

  #parseNominalTypeExpression(): UncheckedNominalType {
    const pos = this.#peek().pos;
    const name: IdentifierEx[] = [];

    do {
      const next = this.#assertKind('identifier');

      name.push({
        pos: next.pos,
        kind: 'identifier',
        name: next.value,
      });
    } while (!this.#endOfFile() && this.#checkSymbol('::'))

    return {
      pos,
      kind: 'nominal',
      name,
    }
  }
}