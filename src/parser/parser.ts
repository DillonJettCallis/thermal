import { isKind, type Kind, Lexer, type Token } from './lexer.ts';
import type { Position, Symbol } from '../ast.ts';
import {
  type Access,
  type ExpressionPhase,
  type FunctionPhase,
  isAccess,
  isExpressionPhase,
  isFunctionPhase
} from '../ast.ts';
import { List, Map, Set } from 'immutable';
import {
  ParserAccessEx,
  ParserAndEx,
  ParserAssignmentStatement,
  ParserAtom,
  ParserBlockEx,
  ParserBooleanLiteralEx,
  ParserCallEx,
  ParserConstantDeclare,
  ParserConstructEntry,
  ParserConstructEx,
  ParserDataDeclare,
  type ParserDataLayout,
  type ParserDeclaration,
  ParserEnumDeclare,
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
  ParserImplDeclare,
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
  ParserNoOpEx,
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
  ParserStruct,
  ParserStructField,
  ParserTuple,
  type ParserTypeExpression,
  ParserTypeParameterType
} from './parserAst.ts';

export class Parser {

  readonly #tokens: Array<Token>;
  readonly #limit: number;
  readonly #module: Symbol;

  #index = 0;

  private constructor(tokens: Array<Token>, module: Symbol) {
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
      return this.#tokens[this.#index]!;
    }
  }

  #skip(): void {
    this.#index++;
  }

  #prev(): Token {
    if (this.#index === 0) {
      throw new Error('Out of bounds');
    } else {
      return this.#tokens[this.#index - 1]!;
    }
  }

  #next(): Token {
    const result = this.#peek();
    this.#skip();
    return result;
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
      next.pos.fail(`Expected symbol ${symbol} but found ${next.kind} '${next.value}'`);
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
    const { pos, mods, next }  = this.#parseDeclarationModifiers();

    switch (next.value) {
      case 'import':
        if (mods.access !== 'internal' || mods.external) {
          return pos.fail('No modifiers are allowed before an import.')
        }

        return this.#parseImportDeclare(pos);
      case 'const':
        return this.#parseConstDeclare(mods.access, mods.external, pos);
      case 'fun':
      case 'def':
      case 'sig':
        return this.#parseFunctionDeclare(this.#module, mods.access, mods.external, next.value, pos, undefined);
      case 'data':
        return this.#parseDataDeclare(mods.access, mods.external, pos);
      case 'enum':
        return this.#parseEnumDeclare(mods.access, mods.external, pos);
      case 'implement':
        if (mods.access !== 'internal') {
          pos.fail('implementations cannot specify any access level')
        }

        if (mods.external) {
          pos.fail('implementations cannot be external, each method must be marked external')
        }

        return this.#parseImplementation(pos);
      default:
        return pos.fail(`Expected declaration but found ${next.kind} '${next.value}'`);
    }
  }

  #parseDeclarationModifiers(): { pos: Position, mods: DeclareModifiers, next: Token & { kind: 'keyword' } } {
    const mods: DeclareModifiers = {
      access: 'internal',
      external: false,
    };

    let pos: Position | undefined = undefined;

    while (true) {
      const next = this.#assertKind('keyword');
      pos ??= next.pos;

      if (isAccess(next.value)) {
        if (mods.access !== 'internal') {
          return next.pos.fail('More than one access modifier found!');
        } else {
          mods.access = next.value;
        }
      } else if (next.value === 'external') {
        if (mods.external) {
          return next.pos.fail('Duplicate `external` modifier.');
        } else {
          mods.external = true;
        }
      } else {
        return { pos, mods, next };
      }
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

  #parseConstDeclare(access: Access, external: boolean, pos: Position): ParserConstantDeclare {
    // we've already parsed the 'const' keyword and the access modifier

    const nameToken = this.#assertKind('identifier');
    this.#assertSymbol(':');
    const type = this.#parseTypeExpression();
    // yes, I'm using a comma expression. In my defense, typescript doesn't have `if` expressions.
    const expression = external ? (this.#checkSymbol(';'), new ParserNoOpEx({ pos: nameToken.pos })) : (this.#assertSymbol('='), this.#parseExpression());

    return new ParserConstantDeclare({
      pos,
      access,
      external,
      symbol: this.#module.child(nameToken.value),
      name: nameToken.value,
      type,
      expression,
    });
  }

  #parseFunctionDeclare(parent: Symbol, access: Access, external: boolean, functionPhase: FunctionPhase, pos: Position, self: ParserTypeExpression | undefined): ParserFunctionDeclare {
    const { name, typeParams, params, result } = this.#parseFunctionSignature(self);
    const symbol = parent.child(name);

    if (external) {
      this.#checkSymbol(';');
      return new ParserFunctionDeclare({
        pos,
        access,
        functionPhase,
        external,
        name,
        symbol,
        typeParams,
        params,
        result,
        body: new ParserNoOpEx({
          pos,
        }),
      });
    }

    const final = this.#assertKind('symbol');

    const body = final.value === '='
      ? this.#parseExpression()
      : final.value === '{'
        ? this.#parseBlockExpression(final.pos)
        : final.pos.fail('Expected function body');

    return new ParserFunctionDeclare({
      pos,
      access,
      external,
      name,
      symbol,
      typeParams,
      result,
      functionPhase,
      params,
      body,
    });
  }

  #parseDataDeclare(access: Access, external: boolean, pos: Position): ParserDataDeclare {
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();
    const symbol = this.#module.child(name);

    const layout = this.#parseDataLayout(pos, symbol, typeParams);

    return new ParserDataDeclare({
      pos,
      access,
      external,
      symbol,
      name,
      typeParams,
      layout,
    });
  }

  #parseEnumDeclare(access: Access, external: boolean, pos: Position): ParserEnumDeclare {
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();
    this.#assertSymbol('{');
    const symbol = this.#module.child(name);

    const variants = Map(this.#parseList<[string, ParserDataLayout]>('}', true, () => {
      const nameToken = this.#assertKind('identifier');
      const name = nameToken.value;
      const pos = nameToken.pos;
      const layout = this.#parseDataLayout(pos, symbol.child(name), typeParams, symbol);

      return [name, layout] as const;
    }));

    return new ParserEnumDeclare({
      pos,
      access,
      external,
      symbol,
      name,
      typeParams,
      variants,
    });
  }

  #parseDataLayout(pos: Position, symbol: Symbol, typeParams: List<ParserTypeParameterType>, enumName?: Symbol): ParserDataLayout {
    const next = this.#assertKind('symbol');

    switch (next.value) {
      case '{': {
        const fields: Map<string, ParserStructField> = Map(this.#parseList('}', true, () => this.#parseStructField()));

        return new ParserStruct({ pos, symbol, typeParams, fields, enum: enumName });
      }
      case '(': {
        const fields = this.#parseList(')', false, () => this.#parseTypeExpression());
        return new ParserTuple({ pos, fields, symbol, typeParams, enum: enumName });
      }
      default: {
        return new ParserAtom({pos, symbol, typeParams, enum: enumName});
      }
    }
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
    ];
  }

  #parseImplementation(pos: Position): ParserImplDeclare {
    // parse type params, if there are any
    const typeParams = this.#parseTypeParams();

    const base = this.#parseParameterizedTypeExpression();
    const implSymbol = this.#localSymbol(this.#module, base);

    // TODO: in the future, this will need to handle protocol implementations too
    this.#assertSymbol('{');

    const methods = Map<string, ParserFunctionDeclare>().asMutable();

    while(!this.#checkSymbol('}')) {
      const { pos, mods, next: phase } = this.#parseDeclarationModifiers();

      if (!isFunctionPhase(phase.value)) {
        return phase.pos.fail('Expected to find fun, def or sig');
      }

      const method = this.#parseFunctionDeclare(implSymbol, mods.access, mods.external, phase.value, pos, base);

      methods.set(method.name, method.update('typeParams', params => typeParams.concat(params)));
    }

    return new ParserImplDeclare({
      pos,
      symbol: implSymbol,
      base,
      typeParams,
      methods: methods.asImmutable(),
    });
  }

  #localSymbol(root: Symbol, type: ParserTypeExpression): Symbol {
    if (type instanceof ParserNominalType) {
      return type.name.reduce((sum, next) => sum.child(next.name), root);
    } else if (type instanceof ParserParameterizedType) {
      return type.args.reduce((sum, next) => this.#localSymbol(sum, next), this.#localSymbol(root, type.base).child('<')).child('>');
    } else if (type instanceof ParserFunctionTypeParameter) {
      return this.#localSymbol(root, type.type);
    } else if (type instanceof ParserTypeParameterType) {
      return root.child(type.name);
    } else {
      return this.#localSymbol(type.params.reduce((sum, next) => this.#localSymbol(sum, next), root.child('{')).child('=>'), type.result);
    }
  }

  #parseFunctionSignature(self: ParserTypeExpression | undefined): { name: string, typeParams: List<ParserTypeParameterType>, params: List<ParserParameter>, result: ParserTypeExpression } {
    // the word 'fun' has already been parsed by this point
    const name = this.#assertKind('identifier').value;
    const typeParams = this.#parseTypeParams();
    this.#assertSymbol('(');
    const params = this.#parseList(')', false, isFirstItem => this.#parseParameter(isFirstItem, self, undefined));
    this.#assertSymbol(':');
    const result = this.#parseTypeExpression();

    return { name, typeParams, params, result };
  }

  #parseParameter(maybeSelf: boolean, self: ParserTypeExpression | undefined, phase: ExpressionPhase | undefined): ParserParameter {
    const first = this.#next();

    if (first.kind === 'keyword' && isExpressionPhase(first.value)) {
      if (phase === undefined) {
        return this.#parseParameter(maybeSelf, self, first.value)
      } else {
        return first.pos.fail(`Expected parameter name, found ${first.kind} '${first.value}'`);
      }
    } else if (first.kind === 'identifier') {
      const name = first.value;

      if (name === 'self') {
        // self is allowed here
        if (maybeSelf) {
          return new ParserParameter({
            pos: first.pos,
            phase,
            name,
            type: self,
          });
        } else {
          // self is not allowed here, it's either not the first parameter or we are not a method
          return first.pos.fail(`Parameter named 'self' is not allowed here. 'self' can only be used as the first parameter of a method.`);
        }
      }

      this.#assertSymbol(':');

      const type = this.#parseTypeExpression();
      return new ParserParameter({
        pos: first.pos,
        phase,
        name,
        type,
      });
    } else {
      return first.pos.fail(`Expected parameter, found ${first.kind} '${first.value}'`);
    }
  }

  #parseFunctionStatement(functionPhase: FunctionPhase, phase: ExpressionPhase, pos: Position): ParserFunctionStatement {
    const { name, typeParams, params, result } = this.#parseFunctionSignature(undefined);

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
      functionPhase,
      params,
      body,
    });
  }

  #parseExpression(): ParserExpression {
    return this.#parseBinaryExpression();
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
    const sum = this.#parseBinaryExpSet(Set.of('+', '-'), prod);
    const compare = this.#parseBinaryExpSet(Set.of('>', '>=', '<', '<='), sum);
    const equal = this.#parseBinaryExpSet(Set.of('==', '!='), compare);
    const and = this.#parseBinaryExpSet(Set.of('&&'), equal, (pos, left, right) => {
      return new ParserAndEx({
        pos,
        left,
        right,
      });
    });
    const or = this.#parseBinaryExpSet(Set.of('||'), and, (pos, left, right) => {
      return new ParserOrEx({
        pos,
        left,
        right,
      });
    });
    return or();
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
            }),
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
        base: this.#parseExpression(),
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
              name: 'core',
            }), new ParserIdentifierEx({
              pos: next.pos,
              name: 'math',
            }), new ParserIdentifierEx({
              pos: next.pos,
              name: 'negate',
            }),
          ),
        }),
        typeArgs: List(),
        args: List.of(
          this.#parseExpression(),
        ),
      });
    } else {
      return this.#parseStaticAccessExpression();
    }
  }

  #parseStaticAccessExpression(): ParserExpression {
    const base = this.#parseTerm();

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
      const num = Number.parseFloat(next.value);

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
    } else if (next.kind === 'symbol' && next.value === '{') {
      return this.#parseBlockExpression(next.pos);
    } else if (next.kind === 'keyword' && isFunctionPhase(next.value)) {
      return this.#parseLambda(next.value, next.pos);
    } else if (next.kind === 'keyword' && next.value === 'if') {
      return this.#parseIfExpression(next.pos);
    } else if (next.kind === 'keyword' && next.value === 'return') {
      return this.#parseReturnExpression(next.pos);
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

        if (possibleAssignment.kind === 'symbol' && Parser.#reassignmentOps.has(possibleAssignment.value)) {
          this.#skip();
          const name = this.#deconstructAssignmentName(expression);
          const content = this.#parseExpression();

          if (possibleAssignment.value === '=') {
            body.push(new ParserReassignmentStatement({
              pos,
              name,
              expression: content,
            }));
          } else {
            // desugar +=, -=, *= and /= into normal assignments calling their operator functions
            body.push(new ParserReassignmentStatement({
              pos,
              name,
              expression: new ParserCallEx({
                pos: possibleAssignment.pos,
                func: new ParserIdentifierEx({
                  pos: possibleAssignment.pos,
                  name: possibleAssignment.value[0]!,
                }),
                typeArgs: List(),
                args: List.of(
                  expression,
                  content,
                ),
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

  /**
   * This unknown expression must composed entirely of identifiers, access expressions, or this function must throw an error.
   */
  #deconstructAssignmentName(ex: ParserExpression): List<ParserIdentifierEx> {
    if (ex instanceof ParserIdentifierEx) {
      // this is already a simple identifier, just return it
      return List.of(ex);
    } else if (ex instanceof ParserAccessEx) {
      // this is an access, we must check the base and concat it with the field
      return this.#deconstructAssignmentName(ex.base).push(ex.field);
    } else {
      // fail, this is not allowed
      return ex.pos.fail('Expected only identifiers or accessors in reassignment position.');
    }
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
  #parseList<Item>(close: string, trailingComma: boolean, parseItem: (first: boolean) => Item): List<Item> {
    const items = List<Item>().asMutable();
    let first = true;

    while (!this.#checkSymbol(close)) {
      items.push(parseItem(first));
      first = false;
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
          return items.asImmutable();
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

  #parseFunctionTypeExpression(): ParserFunctionType | ParserParameterizedType | ParserNominalType {
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

  #parseParameterizedTypeExpression(): ParserParameterizedType | ParserNominalType {
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
    } while (!this.#endOfFile() && this.#checkSymbol('::'));

    return new ParserNominalType({
      pos,
      name: name.asImmutable(),
    });
  }
}

interface DeclareModifiers {
  access: Access;
  external: boolean; // default to false
}


