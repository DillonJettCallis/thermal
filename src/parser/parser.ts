import { isKind, type Kind, Lexer, type Token } from "./lexer.ts";
import {
  type Access,
  type ExpressionPhase,
  type FunctionPhase,
  isAccess,
  isExpressionPhase,
  isFunctionPhase,
  Position,
  Symbol
} from '../ast.ts';
import { List, Map, Set } from 'immutable';
import {
  ParserAccessEx,
  ParserAndEx,
  ParserAssignmentStatement,
  ParserBlockEx,
  ParserBooleanLiteralEx,
  ParserCallEx,
  ParserConstantDeclare,
  ParserConstructEntry,
  ParserConstructEx,
  type ParserDeclaration,
  ParserEnumAtomVariant,
  ParserEnumDeclare,
  ParserEnumStructVariant,
  ParserEnumTupleVariant,
  type ParserEnumVariant,
  type ParserExpression,
  ParserExpressionStatement,
  ParserFile,
  ParserFloatLiteralEx,
  ParserFunctionDeclare,
  ParserFunctionStatement,
  ParserFunctionType,
  ParserFunctionTypeParameter,
  ParserIdentifierEx,
  ParserIfEx,
  ParserImportDeclaration,
  type ParserImportExpression,
  ParserIntLiteralEx,
  ParserIsEx,
  ParserLambdaEx,
  ParserListLiteralEx,
  ParserMapLiteralEntry,
  ParserMapLiteralEx,
  ParserNestedImportExpression,
  ParserNominalImportExpression,
  ParserNominalType,
  ParserNotEx,
  ParserOrEx,
  ParserParameter,
  ParserParameterizedType,
  ParserReassignmentStatement,
  ParserReturnEx,
  ParserSetLiteralEx,
  type ParserStatement,
  ParserStaticAccessEx,
  ParserStringLiteralEx,
  ParserStructDeclare,
  ParserStructField,
  type ParserTypeExpression,
  ParserTypeParameterType
} from "./parserAst.ts";

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

  static parseFile(path: string, module: Symbol): ParserFile {
    return new ParserFile({
      src: path,
      module,
      declarations: new Parser(Lexer.lexFile(path), module).#parseFile(),
    });
  }

  static parseExpression(path: string, content: string, module: Symbol): ParserExpression {
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

  #parseFile(): List<ParserDeclaration> {
    const decs = List<ParserDeclaration>().asMutable();
    // until we reach the end of the file

    while (!this.#endOfFile()) {
      decs.push(this.#parseDeclaration());

      // skip semi-colons
      while (!this.#endOfFile() && this.#peek().value === ';') {
        this.#skip();
      }
    }

    return decs.asImmutable();
  }

  #parseDeclaration(): ParserDeclaration {
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

  #parseImportDeclare(pos: Position): ParserImportDeclaration {
    // we've already parsed the 'import' keyword
    const pack = this.#parseNominalImport();
    this.#assertSymbol('/');
    const ex = this.#parseImportExpression();

    return new ParserImportDeclaration({
      pos,
      package: pack,
      ex,
    });
  }

  #parseImportExpression(): ParserImportExpression {
    const base = this.#parseNominalImport();

    if (this.#checkSymbol('::')) {
      if (this.#checkSymbol('{')) {
        return new ParserNestedImportExpression({
          pos: base.pos,
          base,
          children: this.#parseList('}', true, () => this.#parseImportExpression()),
        });
      } else {
        return new ParserNestedImportExpression({
          pos: base.pos,
          base,
          children: List.of(this.#parseImportExpression()),
        });
      }
    } else {
      return base;
    }
  }

  #parseNominalImport(): ParserNominalImportExpression {
    const name = this.#assertKind('identifier');

    return new ParserNominalImportExpression({
      pos: name.pos,
      name: name.value,
    });
  }

  #parseConstDeclare(access: Access, pos: Position): ParserConstantDeclare {
    // we've already parsed the 'const' keyword and the access modifier

    const nameToken = this.#assertKind('identifier');
    this.#assertSymbol(':');
    const type = this.#parseTypeExpression();
    this.#assertSymbol('=');
    const expression = this.#parseExpression();

    return new ParserConstantDeclare({
      pos,
      access,
      symbol: this.#module.child(nameToken.value),
      name: nameToken.value,
      type,
      expression,
    });
  }

  #parseFunctionDeclare(extern: boolean, access: Access, phase: FunctionPhase, pos: Position): ParserFunctionDeclare {
    const func = this.#parseFunctionStatement(phase, 'const', pos);

    return new ParserFunctionDeclare({
      func,
      extern,
      access,
      symbol: this.#module.child(func.name),
      pos,
    });
  }

  #parseStructDeclare(access: Access, pos: Position): ParserStructDeclare {
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();

    this.#assertSymbol('{');
    const fields: Map<string, ParserStructField> = Map(this.#parseList('}', true, () => this.#parseStructField()));

    return new ParserStructDeclare({
      pos,
      access,
      symbol: this.#module.child(name),
      name,
      typeParams,
      fields,
    });
  }

  #parseEnumDeclare(access: Access, pos: Position): ParserEnumDeclare {
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();
    this.#assertSymbol('{');
    const symbol = this.#module.child(name);

    const variants = Map(this.#parseList<[string, ParserEnumVariant]>('}', true, () => {
      const nameToken = this.#assertKind('identifier');
      const name = nameToken.value;
      const pos = nameToken.pos;
      const next = this.#assertKind('symbol');

      switch (next.value) {
        case '{': {
          const fields: Map<string, ParserStructField> = Map(this.#parseList('}', true, () => this.#parseStructField()));

          return [name, new ParserEnumStructVariant({ pos, symbol: symbol.child(name), fields })] as const;
        }
        case '(': {
          const fields = this.#parseList(')', false, () => this.#parseTypeExpression());
          return [name, new ParserEnumTupleVariant({ pos, fields, symbol: symbol.child(name) })] as const;
        }
        default:
          return [name, new ParserEnumAtomVariant({ pos, symbol: symbol.child(name) })] as const;
      }
    }));

    return new ParserEnumDeclare({
      pos,
      access,
      symbol,
      name,
      typeParams,
      variants,
    });
  }

  #parseStructField(): [string, ParserStructField] {
    const id = this.#assertKind('identifier');
    const name = id.value;
    this.#assertSymbol(':');
    const type = this.#parseTypeExpression();

    const defaultEx = this.#checkSymbol('=')
      ? this.#parseExpression()
      : undefined;

    return [
      name,
      new ParserStructField({
        pos: id.pos,
        type,
        default: defaultEx,
      }),
    ]
  }

  #parseFunctionStatement(functionPhase: FunctionPhase, phase: ExpressionPhase, pos: Position): ParserFunctionStatement {
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
        return new ParserParameter({
          pos: first.pos,
          phase,
          name,
          type,
        });
      } else if (first.kind === 'identifier') {
        const name = first.value;
        this.#assertSymbol(':');
        const type = this.#parseTypeExpression();
        return new ParserParameter({
          pos: first.pos,
          phase: undefined,
          name,
          type,
        });
      } else {
        return first.pos.fail(`Expected parameter, found ${first.kind} '${first.value}'`);
      }
    });
    this.#assertSymbol(':');
    const result = this.#parseTypeExpression();

    const final = this.#assertKind('symbol');
    const body = final.value === '='
      ? this.#parseExpression()
      : final.value === '{'
        ? this.#parseBlockExpression(final.pos)
        : final.pos.fail('Expected function body');

    return new ParserFunctionStatement({
      pos,
      phase,
      name,
      typeParams,
      result,
      lambda: new ParserLambdaEx({
        pos,
        functionPhase,
        params,
        body,
      })
    });
  }

  #parseExpression(): ParserExpression {
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

  #parseLambda(functionPhase: FunctionPhase, pos: Position): ParserLambdaEx {
    // the opening phase has already been parsed
    this.#assertSymbol('{');

    return new ParserLambdaEx({
      pos,
      functionPhase,
      params: this.#parseList('=>', false, () => {
        const first = this.#next();
        const [phase, name] = isExpressionPhase(first.value)
          ? [first.value, this.#assertKind('identifier')]
          : [undefined, first];

        if (this.#checkSymbol(':')) {
          return new ParserParameter({
            pos: name.pos,
            phase,
            name: name.value,
            type: this.#parseTypeExpression(),
          });
        } else {
          return new ParserParameter({
            pos: name.pos,
            phase,
            name: name.value,
            type: undefined,
          });
        }
      }),
      body: this.#parseBlockExpression(pos),
    });
  }

  #parseIfExpression(pos: Position): ParserIfEx {
    // the 'if' has already been parsed
    this.#assertSymbol('(');
    const condition = this.#parseExpression();
    this.#assertSymbol(')');
    const thenEx = this.#parseExpression();
    const elseEx = this.#checkKeyword('else')
      ? this.#parseExpression()
      : undefined;

    return new ParserIfEx({
      pos,
      condition,
      thenEx,
      elseEx,
    });
  }

  #parseReturnExpression(pos: Position): ParserReturnEx {
    // the 'return' has already been parsed
    return new ParserReturnEx({
      pos,
      base: this.#parseExpression(),
    });
  }

  #parseBinaryExpression(): ParserExpression {
    const start = this.#parseIsExpression.bind(this);
    const prod = this.#parseBinaryExpSet(Set.of('*', '/'), start);
    const sum = this.#parseBinaryExpSet(Set.of("+", "-"), prod)
    const compare = this.#parseBinaryExpSet(Set.of(">", ">=", "<", "<="), sum)
    const equal = this.#parseBinaryExpSet(Set.of("==", "!="), compare)
    const and = this.#parseBinaryExpSet(Set.of("&&"), equal, (pos, left, right) => {
      return new ParserAndEx({
        pos,
        left,
        right,
      });
    });
    const or = this.#parseBinaryExpSet(Set.of("||"), and, (pos, left, right) => {
      return new ParserOrEx({
        pos,
        left,
        right,
      });
    });
    return or()
  }

  #parseBinaryExpSet(ops: Set<string>, tail: () => ParserExpression, handler?: (pos: Position, left: ParserExpression, right: ParserExpression) => ParserExpression): () => ParserExpression {
    const recurse = (): ParserExpression => {
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

        return new ParserCallEx({
          pos: next.pos,
          func: new ParserIdentifierEx({
            pos: next.pos,
            name: next.value,
          }),
          typeArgs: List(),
          args: List.of(
            left,
            right,
          ),
        });
      } else {
        return left;
      }
    };

    return recurse;
  }

  #parseIsExpression(): ParserExpression {
    const base = this.#parseCallExpression();

    if (this.#endOfFile()) {
      return base;
    }

    const next = this.#peek();

    if (next.value === 'is' || next.value === '!is') {

      return new ParserIsEx({
        pos: next.pos,
        not: next.value === '!is',
        base,
        check: this.#parseTypeExpression(),
      });
    } else {
      return base;
    }
  }

  #parseCallExpression(): ParserExpression {
    const base = this.#parseConstruct();
    const typeArgs = this.#parseFunctionTypeArguments();

    if (this.#checkSymbol('(')) {
      const args = this.#parseList(')', true, () => this.#parseExpression());

      return new ParserCallEx({
        pos: base.pos,
        func: base,
        typeArgs: List(),
        args,
      });
    } else {
      if (typeArgs !== undefined) {
        base.pos.fail('Found generics but no function call');
      }

      return base;
    }
  }

  #parseFunctionTypeArguments(): List<ParserTypeExpression> | undefined {
    if (this.#checkSymbol('[')) {
      return this.#parseList(']', false, () => this.#parseTypeExpression());
    } else {
      return undefined;
    }
  }

  #parseConstruct(): ParserExpression {
    const base = this.#parseAccessExpression();

    if (this.#checkSymbol('{')) {
      const fields = this.#parseList('}', true, () => {
        const name = this.#assertKind('identifier');

        if (this.#checkSymbol(':')) {
          const value = this.#parseExpression();

          return new ParserConstructEntry({
            pos: name.pos,
            name: name.value,
            value,
          });
        } else {
          return new ParserConstructEntry({
            pos: name.pos,
            name: name.value,
            value: new ParserIdentifierEx({
              pos: name.pos,
              name: name.value,
            })
          });
        }
      });

      return new ParserConstructEx({
        pos: base.pos,
        base,
        typeArgs: List(), // TODO: parse type arguments for a struct
        fields,
      });
    } else {
      return base;
    }
  }

  #parseAccessExpression(): ParserExpression {
    let base = this.#parseCollectionLiteral();

    while (this.#checkSymbol('.')) {
      const pos = this.#prev().pos;
      const field = this.#assertKind('identifier');
      base = new ParserAccessEx({
        pos,
        base,
        field: new ParserIdentifierEx({
          pos: field.pos,
          name: field.value,
        }),
      });
    }

    return base;
  }

  #parseCollectionLiteral(): ParserExpression {
    const next = this.#peek();

    switch (next.value) {
      case '[':
        this.#skip();
        return new ParserListLiteralEx({
          pos: next.pos,
          values: this.#parseList(']', true, () => this.#parseExpression()),
        });
      case '%[':
        this.#skip();
        return new ParserSetLiteralEx({
          pos: next.pos,
          values: this.#parseList(']', true, () => this.#parseExpression()),
        });
      case '#[':
        this.#skip();
        return new ParserMapLiteralEx({
          pos: next.pos,
          values: this.#parseList(']', true, () => {
            const key = this.#parseExpression();
            this.#assertSymbol(':');
            const value = this.#parseExpression();
            return new ParserMapLiteralEntry({
              pos: key.pos,
              key,
              value,
            });
          }),
        });
      default:
        return this.#parseNot();
    }
  }

  #parseNot(): ParserExpression {
    const next = this.#peek();

    if (next.value === '!') {
      this.#skip();

      return new ParserNotEx({
        pos: next.pos,
        base: this.#parseNegate(),
      });
    } else {
      return this.#parseNegate();
    }
  }

  #parseNegate(): ParserExpression {
    const next = this.#peek();

    if (next.value === '-') {
      this.#skip();

      return new ParserCallEx({
        pos: next.pos,
        func: new ParserStaticAccessEx({
          pos: next.pos,
          path: List.of(
            new ParserIdentifierEx({
              pos: next.pos,
              name: 'core'
            }), new ParserIdentifierEx({
              pos: next.pos,
              name: 'math'
            }), new ParserIdentifierEx({
              pos: next.pos,
              name: 'negate'
            }),
          ),
        }),
        typeArgs: List(),
        args: List.of(
          this.#parseStaticAccessExpression(),
        ),
      });
    } else {
      return this.#parseStaticAccessExpression();
    }
  }

  #parseStaticAccessExpression(): ParserExpression {
    let base = this.#parseTerm();

    if (base instanceof ParserIdentifierEx && this.#checkSymbol('::')) {
      const path = List.of<ParserIdentifierEx>(base).asMutable();
      const pos = this.#prev().pos;

      do {
        const field = this.#assertKind('identifier');

        path.push(new ParserIdentifierEx({
          pos: field.pos,
          name: field.value,
        }));
      } while (this.#checkSymbol('::'));

      return new ParserStaticAccessEx({
        pos,
        path: path.asImmutable(),
      });
    }

    return base;
  }

  #parseTerm(): ParserExpression {
    const next = this.#next();

    if (next.kind === 'string') {
      return new ParserStringLiteralEx({
        pos: next.pos,
        value: next.value,
      });
    } else if (next.kind === 'number') {
      // TODO: there is more to number literals than this
      const num = Number.parseFloat(next.value)

      if (Number.isSafeInteger(num)) {
        return new ParserIntLiteralEx({
          pos: next.pos,
          value: num,
        });
      } else {
        return new ParserFloatLiteralEx({
          pos: next.pos,
          value: num,
        });
      }
    } else if (next.kind === 'keyword' && (next.value === 'true' || next.value === 'false')) {
      return new ParserBooleanLiteralEx({
        pos: next.pos,
        value: next.value === 'true',
      });
    } else if (next.kind === 'identifier') {
      return new ParserIdentifierEx({
        pos: next.pos,
        name: next.value,
      });
    } else {
      return next.pos.fail(`Expected term, found ${next.kind} '${next.value}'`);
    }
  }

  static readonly #reassignmentOps = Set.of('=', '+=', '-=', '*=', '/=');

  #parseBlockExpression(pos: Position): ParserBlockEx {
    // the opening brace has already been parsed
    const body = List<ParserStatement>().asMutable();

    while (!this.#checkSymbol('}')) {
      const first = this.#peek();

      if (first.kind === 'symbol' && first.value === ';') {
        // do nothing
        this.#skip();
      } else if (first.kind === 'keyword' && isExpressionPhase(first.value)) {
        this.#skip();
        const next = this.#peek();

        if (next.kind === 'keyword' && isFunctionPhase(next.value)) {
          this.#skip();
          body.push(this.#parseFunctionStatement(next.value, first.value, pos));
        } else {
          body.push(this.#parseAssignment(first.value, pos));
        }
      } else {
        const expression = this.#parseExpression();
        const possibleAssignment = this.#peek();

        if (expression instanceof ParserIdentifierEx && possibleAssignment.kind === 'symbol' && Parser.#reassignmentOps.has(possibleAssignment.value)) {
          this.#skip();
          const content = this.#parseExpression();

          if (possibleAssignment.value === '=') {
            body.push(new ParserReassignmentStatement({
              pos,
              name: expression.name,
              expression: content,
            }));
          } else {
            // desugar +=, -=, *= and /= into normal assignments calling their operator functions
            body.push(new ParserReassignmentStatement({
              pos,
              name: expression.name,
              expression: new ParserCallEx({
                pos: possibleAssignment.pos,
                func: new ParserIdentifierEx({
                  pos: possibleAssignment.pos,
                  name: possibleAssignment.value[0]!!,
                }),
                typeArgs: List(),
                args: List.of(
                  expression,
                  content,
                )
              }),
            }));
          }
        } else {
          body.push(new ParserExpressionStatement({
            pos,
            expression,
          }));
        }
      }
    }

    return new ParserBlockEx({
      pos,
      body: body.asImmutable(),
    });
  }

  #parseAssignment(phase: ExpressionPhase, pos: Position): ParserAssignmentStatement {
    // the initial keyword has already been parsed
    const name = this.#assertKind('identifier').value;
    const type = this.#checkSymbol(':')
      ? this.#parseTypeExpression()
      : undefined;

    this.#assertSymbol('=');
    const expression = this.#parseExpression();

    return new ParserAssignmentStatement({
      pos,
      phase,
      name,
      type,
      expression,
    });
  }

  /**
   * Parse a comma seperated list of anything
   */
  #parseList<Item>(close: string, trailingComma: boolean, parseItem: () => Item): List<Item> {
    const items = List<Item>().asMutable();

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

    return items.asImmutable();
  }

  #parseTypeParams(): List<ParserTypeParameterType> {
    if (this.#checkSymbol('<')) {
      return this.#parseList('>', false, () => {
        const id = this.#assertKind('identifier');

        return new ParserTypeParameterType({
          pos: id.pos,
          name: id.value,
        });
      });
    } else {
      return List();
    }
  }

  #functionTypeParameter(): ParserFunctionTypeParameter {
    const next = this.#peek();

    if (next.kind === 'keyword' && isExpressionPhase(next.value)) {
      this.#skip();
      return new ParserFunctionTypeParameter({
        pos: next.pos,
        phase: next.value,
        type: this.#parseFunctionTypeExpression(),
      });
    } else {
      return new ParserFunctionTypeParameter({
        pos: next.pos,
        phase: undefined,
        type: this.#parseFunctionTypeExpression(),
      });
    }
  }

  #parseTypeExpression(): ParserTypeExpression {
    return this.#parseFunctionTypeExpression();
  }

  #parseFunctionTypeExpression(): ParserTypeExpression {
    const next = this.#peek();

    if (next.kind === 'keyword' && isFunctionPhase(next.value)) {
      this.#skip();
      this.#assertSymbol('{');
      const params = this.#parseList('->', false, () => this.#functionTypeParameter());
      const result = this.#parseTypeExpression();
      this.#assertSymbol('}');
      return new ParserFunctionType({
        pos: next.pos,
        phase: next.value,
        params,
        result,
      });
    } else if (this.#checkSymbol('{')) {
      const params = this.#parseList('->', false, () => this.#functionTypeParameter());
      const result = this.#parseTypeExpression();
      this.#assertSymbol('}');
      return new ParserFunctionType({
        pos: next.pos,
        phase: 'fun',
        params,
        result,
      });
    } else {
      return this.#parseParameterizedTypeExpression();
    }
  }

  #parseParameterizedTypeExpression(): ParserTypeExpression {
    const base = this.#parseNominalTypeExpression();

    if (this.#checkSymbol('<')) {
      const args = this.#parseList('>', false, () => this.#parseTypeExpression());

      return new ParserParameterizedType({
        pos: base.pos,
        base,
        args,
      });
    } else {
      return base;
    }
  }

  #parseNominalTypeExpression(): ParserNominalType {
    const pos = this.#peek().pos;
    const name = List<ParserIdentifierEx>().asMutable();

    do {
      const next = this.#assertKind('identifier');

      name.push(new ParserIdentifierEx({
        pos: next.pos,
        name: next.value,
      }));
    } while (!this.#endOfFile() && this.#checkSymbol('::'))

    return new ParserNominalType({
      pos,
      name: name.asImmutable(),
    });
  }
}