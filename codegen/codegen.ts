import { List, Map, Seq, Set } from 'immutable';
import { createWriteStream } from 'node:fs';
import { Stream } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';

/**
 * Here we have a mini library for generating code for all of the ASTs we have to deal with in the compiler
 */


type Type
  = { kind: 'lib', package: string, name: string }
  | { kind: 'local', name: string }
  | { kind: 'util', name: string, type: boolean }
  | { kind: 'list', item: Type }
  | { kind: 'set', item: Type }
  | { kind: 'map', key: Type, value: Type }
  | { kind: 'optional', base: Type }
  | { kind: 'native', name: string }
  ;

interface Record {
  name: string;
  fields: { [key: string]: Type };
}


function list(item: Type): Type {
  return {
    kind: 'list',
    item,
  };
}

function set(item: Type): Type {
  return {
    kind: 'set',
    item,
  };
}

function map(key: Type, value: Type): Type {
  return {
    kind: 'map',
    key,
    value,
  };
}

function optional(base: Type): Type {
  return {
    kind: 'optional',
    base,
  };
}

function util(name: string, type: boolean): Type {
  return {
    kind: 'util',
    name,
    type,
  };
}

function native(name: 'string' | 'boolean' | 'number'): Type {
  return {
    kind: 'native',
    name,
  };
}

const pos = util('Position', false);
const symbol = util('Symbol', false);
const access = util('Access', true);
const expressionPhase = util('ExpressionPhase', true);
const functionPhase = util('FunctionPhase', true);
const packageName = util('PackageName', false);

class Generator {
  readonly #records = List<Record>().asMutable();
  readonly #imports = Map<string, Set<string>>().asMutable();
  readonly #types = Map<string, List<string>>().asMutable();
  readonly #prefix: string;

  constructor(prefix: string) {
    this.#prefix = prefix;
    this.#imports.set('immutable', Set.of('Map', 'List', 'Set', 'Record'));
  }

  type(name: string, ...members: Array<{ kind: 'local', name: string }>): { kind: 'local', name: string } {
    const newName = this.#prefix + name;
    this.#types.set(newName, List());

    for (const member of members) {
      this.#types.update(member.name, prev => prev?.push(newName) ?? List());
    }

    return {kind: 'local', name: newName};
  }

  add(name: string, fields: { [key: string]: Type }, ...members: Array<{ kind: 'local', name: string }>): { kind: 'local', name: string } {
    const newName = this.#prefix + name;
    this.#records.push({name: newName, fields});

    for (const member of members) {
      this.#types.update(member.name, prev => prev?.push(newName) ?? List());
    }

    for (const [, value] of Seq.Keyed(fields)) {
      this.#loadImports(value);
    }

    return {kind: 'local', name: newName};
  }

  #loadImports(type: Type): void {
    switch (type.kind) {
        case 'lib':
          this.#imports.update(type.package, prev => (prev ?? Set<string>()).add(type.name));
          break;
        case 'util':
          this.#imports.update('../ast.ts', prev => (prev ?? Set<string>()).add(type.type ? `type ${type.name}` : type.name));
          break;
      case 'optional':
        this.#loadImports(type.base);
        break;
      case 'list':
        case 'set':
        this.#loadImports(type.item);
        break;
      case 'map':
        this.#loadImports(type.key);
        this.#loadImports(type.value);
        break;
    }
  }

  *generate(): IterableIterator<string> {
    for (const [pack, values] of this.#imports) {
      yield `import { `;
      for (const value of values) {
        yield value;
        yield `, `;
      }
      yield ` } from '${pack}';\n`
    }
    yield '\n';

    for (const [name, members] of this.#types) {
      yield `export type ${name}\n`
      yield `  = ${members.first()}\n`
      for (const member of members.toSeq().skip(1)) {
        yield `  | ${member}\n`;
      }
      yield `  ;\n\n`;
    }

    for (const {name, fields} of this.#records) {
      yield `interface Mutable${name} {\n`;
      for (const [key, value] of Seq.Keyed(fields)) {
        yield `  ${key}: ${this.#localName(value)};\n`;
      }
      yield `}\n`;
      yield `export class ${name} extends Record<Mutable${name}>({\n`;
      for (const [key, value] of Seq.Keyed(fields)) {
        yield `  ${key}: undefined as unknown as ${this.#localName(value)},\n`;
      }
      yield `}) {\n`;
      yield `  constructor(props: Mutable${name}) {\n`;
      yield `    super(props);\n`;
      yield `  }\n`;
      yield `}\n\n`;
    }
  }

  #localName(type: Type): string {
    switch (type.kind) {
      case "lib":
      case "util":
      case 'native':
      case "local":
        return type.name;
      case "list":
        return `List<${this.#localName(type.item)}>`;
      case "set":
        return `Set<${this.#localName(type.item)}>`;
      case "map":
        return `Map<${this.#localName(type.key)}, ${this.#localName(type.value)}>`;
      case "optional":
        return `${this.#localName(type.base)} | undefined`;
    }
  }
}

function parser(): Generator {
  const gen = new Generator('Parser');

  const typeExpression = gen.type('TypeExpression');

  const expression = gen.type('Expression');

  for (const [name, lit] of [['Boolean', 'boolean'], ['Int', 'number'], ['Float', 'number'], ['String', 'string']] as const) {
    gen.add(`${name}LiteralEx`, {
      pos,
      value: native(lit),
    }, expression);
  }

  const identifierEx = gen.add('IdentifierEx', {
    pos,
    name: native('string'),
  }, expression);

  const concreteType = gen.type('ConcreteType', typeExpression);

  const nominalType = gen.add('NominalType', {
    pos,
    name: list(identifierEx),
  }, concreteType);

  gen.add('ParameterizedType', {
    pos,
    base: nominalType,
    args: list(typeExpression),
  }, concreteType);

  const functionTypeParameterType = gen.add('FunctionTypeParameter', {
    pos,
    phase: optional(expressionPhase),
    type: typeExpression,
  }, typeExpression);

  gen.add('FunctionType', {
    pos,
    phase: functionPhase,
    params: list(functionTypeParameterType),
    result: typeExpression,
  }, typeExpression);

  const typeParameterType = gen.add('TypeParameterType', {
    pos,
    name: native('string'),
  }, typeExpression);

  gen.add('ListLiteralEx', {
    pos,
    values: list(expression),
  }, expression);

  gen.add('SetLiteralEx', {
    pos,
    values: list(expression),
  }, expression);

  const mapEntry = gen.add('MapLiteralEntry', {
    pos,
    key: expression,
    value: expression,
  });

  gen.add('MapLiteralEx', {
    pos,
    values: list(mapEntry),
  }, expression);

  gen.add('IsEx', {
    pos,
    not: native('boolean'),
    base: expression,
    check: typeExpression,
  }, expression);

  gen.add('NotEx', {
    pos,
    base: expression,
  }, expression);

  gen.add('OrEx', {
    pos,
    left: expression,
    right: expression,
  }, expression);

  gen.add('AndEx', {
    pos,
    left: expression,
    right: expression,
  }, expression);

  gen.add('AccessEx', {
    pos,
    base: expression,
    field: identifierEx,
  }, expression);

  gen.add('StaticAccessEx', {
    pos,
    path: list(identifierEx),
  }, expression);

  const constructEntry = gen.add('ConstructEntry', {
    pos,
    name: native('string'),
    value: expression,
  });

  gen.add('ConstructEx', {
    pos,
    base: expression,
    typeArgs: list(typeExpression),
    fields: list(constructEntry),
  }, expression);

  const lambdaParameter = gen.add('Parameter', {
    pos,
    name: native('string'),
    phase: optional(expressionPhase),
    type: optional(typeExpression),
  });

  gen.add('LambdaEx', {
    pos,
    functionPhase,
    params: list(lambdaParameter),
    body: expression,
  }, expression);

  const statement = gen.type('Statement');

  gen.add('BlockEx', {
    pos,
    body: list(statement),
  }, expression);

  gen.add('NoOpEx', {
    pos,
  }, expression);

  gen.add('ExpressionStatement', {
    pos,
    expression,
  }, statement);

  gen.add('AssignmentStatement', {
    pos,
    name: native('string'),
    phase: expressionPhase,
    type: optional(typeExpression),
    expression,
  }, statement);

  gen.add('ReassignmentStatement', {
    pos,
    name: list(identifierEx),
    expression,
  }, statement);

  const func = gen.type('Function');

  gen.add('FunctionStatement', {
    pos,
    phase: expressionPhase,
    name: native('string'),
    typeParams: list(typeParameterType),
    result: typeExpression,
    functionPhase,
    params: list(lambdaParameter),
    body: expression,
  }, statement, func);

  gen.add('CallEx', {
    pos,
    func: expression,
    typeArgs: list(typeExpression),
    args: list(expression),
  }, expression);

  gen.add('IfEx', {
    pos,
    condition: expression,
    thenEx: expression,
    elseEx: optional(expression),
  }, expression);

  gen.add('ReturnEx', {
    pos,
    base: expression,
  }, expression);

  const declare = gen.type('Declaration');
  const importEx = gen.type('ImportExpression');

  const nominalImportEx = gen.add('NominalImportExpression', {
    pos,
    name: native('string'),
  }, importEx);

  gen.add('NestedImportExpression', {
    pos,
    base: nominalImportEx,
    children: list(importEx),
  }, importEx);

  gen.add('ImportDeclaration', {
    pos,
    package: nominalImportEx,
    ex: importEx,
  }, declare);

  const funcDeclare = gen.add('FunctionDeclare', {
    pos,
    access,
    external: native('boolean'),
    name: native('string'),
    symbol,
    typeParams: list(typeParameterType),
    result: typeExpression,
    functionPhase,
    params: list(lambdaParameter),
    body: expression,
  }, declare, func);

  const structField = gen.add('StructField', {
    pos,
    type: typeExpression,
    default: optional(expression),
  });

  const dataLayout = gen.type('DataLayout');

  gen.add('Struct', {
    pos,
    symbol,
    typeParams: list(typeParameterType),
    fields: map(native('string'), structField),
    enum: optional(symbol),
  }, dataLayout);

  gen.add('Tuple', {
    pos,
    symbol,
    typeParams: list(typeParameterType),
    fields: list(typeExpression),
    enum: optional(symbol),
  }, dataLayout);

  gen.add('Atom', {
    pos,
    symbol,
    typeParams: list(typeParameterType),
    enum: optional(symbol),
  }, dataLayout);

  gen.add('DataDeclare', {
    pos,
    access,
    symbol,
    name: native('string'),
    typeParams: list(typeParameterType),
    layout: dataLayout,
  }, declare);

  gen.add('EnumDeclare', {
    pos,
    access,
    symbol,
    name: native('string'),
    typeParams: list(typeParameterType),
    variants: map(native('string'), dataLayout),
  }, declare);

  gen.add('ConstantDeclare', {
    pos,
    access,
    symbol,
    external: native('boolean'),
    name: native('string'),
    expression,
    type: typeExpression,
  }, declare);

  // TODO: handle protocol implementations in the future
  gen.add('ImplDeclare', {
    pos,
    symbol,
    typeParams: list(typeParameterType),
    base: concreteType,
    methods: map(native('string'), funcDeclare),
  }, declare);

  gen.add('File', {
    src: native('string'),
    module: symbol,
    declarations: list(declare),
  });

  return gen;
}

function checker(): Generator {
  const gen = new Generator('Checked');

  const typeExpression = gen.type('TypeExpression');

  const expression = gen.type('Expression');

  for (const [name, lit] of [['Boolean', 'boolean'], ['Int', 'number'], ['Float', 'number'], ['String', 'string']] as const) {
    gen.add(`${name}LiteralEx`, {
      pos,
      value: native(lit),
      type: typeExpression,
      phase: expressionPhase,
    }, expression);
  }

  const identifierEx = gen.add('IdentifierEx', {
    pos,
    name: native('string'),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  const concreteType = gen.type('ConcreteType', typeExpression);

  const nominalType = gen.add('NominalType', {
    name: symbol,
  }, concreteType);

  gen.add('ParameterizedType', {
    base: nominalType,
    args: list(typeExpression),
  }, concreteType);

  const functionTypeParameterType = gen.add('FunctionTypeParameter', {
    phase: optional(expressionPhase),
    type: typeExpression,
  }, typeExpression);

  const typeParameterType = gen.add('TypeParameterType', {
    name: symbol,
    // TODO: someday we'll have bounds and this is where they'll be declared
  }, typeExpression);

  const functionType = gen.add('FunctionType', {
    phase: functionPhase,
    typeParams: list(typeParameterType),
    params: list(functionTypeParameterType),
    result: typeExpression,
  }, typeExpression);

  gen.add('OverloadFunctionType', {
    branches: list(functionType),
  }, typeExpression);

  gen.add('ModuleType', {
    name: symbol,
  }, typeExpression);

  const dataLayoutType = gen.type('DataLayoutType', typeExpression);

  gen.add('StructType', {
    pos,
    name: symbol,
    typeParams: list(typeParameterType),
    fields: map(native('string'), typeExpression),
    enum: optional(symbol),
  }, dataLayoutType);

  gen.add('TupleType', {
    pos,
    name: symbol,
    typeParams: list(typeParameterType),
    fields: list(typeExpression),
    enum: optional(symbol),
  }, dataLayoutType);

  gen.add('AtomType', {
    pos,
    name: symbol,
    typeParams: list(typeParameterType),
    enum: optional(symbol),
  }, dataLayoutType);

  gen.add('EnumType', {
    pos,
    name: symbol,
    typeParams: list(typeParameterType),
    variants: map(native('string'), dataLayoutType),
  }, typeExpression);

  gen.add('ListLiteralEx', {
    pos,
    values: list(expression),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('SetLiteralEx', {
    pos,
    values: list(expression),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  const mapEntry = gen.add('MapLiteralEntry', {
    pos,
    key: expression,
    value: expression,
  });

  gen.add('MapLiteralEx', {
    pos,
    values: list(mapEntry),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('IsEx', {
    pos,
    not: native('boolean'),
    base: expression,
    check: typeExpression,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('NotEx', {
    pos,
    base: expression,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('OrEx', {
    pos,
    left: expression,
    right: expression,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('AndEx', {
    pos,
    left: expression,
    right: expression,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('AccessEx', {
    pos,
    base: expression,
    field: identifierEx,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('StaticAccessEx', {
    pos,
    path: list(identifierEx),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('StaticReferenceEx', {
    pos,
    symbol,
    module: symbol,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  const constructEntry = gen.add('ConstructEntry', {
    pos,
    name: native('string'),
    value: expression,
  });

  gen.add('ConstructEx', {
    pos,
    base: expression,
    typeArgs: list(typeExpression),
    fields: list(constructEntry),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  const lambdaParameter = gen.add('Parameter', {
    pos,
    name: native('string'),
    phase: optional(expressionPhase),
    type: typeExpression,
  });

  gen.add('LambdaEx', {
    pos,
    functionPhase,
    params: list(lambdaParameter),
    body: expression,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  const statement = gen.type('Statement');

  gen.add('BlockEx', {
    pos,
    body: list(statement),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('NoOpEx', {
    pos,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('ExpressionStatement', {
    pos,
    expression,
    type: typeExpression,
    phase: expressionPhase,
  }, statement);

  gen.add('AssignmentStatement', {
    pos,
    name: native('string'),
    phase: expressionPhase,
    type: typeExpression,
    expression,
  }, statement);

  gen.add('ReassignmentStatement', {
    pos,
    name: list(identifierEx),
    type: typeExpression,
    phase: expressionPhase,
    expression,
  }, statement);

  const func = gen.type('Function');

  gen.add('FunctionStatement', {
    pos,
    phase: expressionPhase,
    name: native('string'),
    typeParams: list(typeParameterType),
    result: typeExpression,
    functionPhase,
    params: list(lambdaParameter),
    body: expression,
    type: typeExpression,
  }, statement, func);

  gen.add('CallEx', {
    pos,
    func: expression,
    typeArgs: list(typeExpression),
    args: list(expression),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('IfEx', {
    pos,
    condition: expression,
    thenEx: expression,
    elseEx: optional(expression),
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  gen.add('ReturnEx', {
    pos,
    base: expression,
    type: typeExpression,
    phase: expressionPhase,
  }, expression);

  const declare = gen.type('Declaration');
  const importEx = gen.type('ImportExpression');

  const nominalImportEx = gen.add('NominalImportExpression', {
    pos,
    name: native('string'),
  }, importEx);

  gen.add('NestedImportExpression', {
    pos,
    base: nominalImportEx,
    children: list(importEx),
  }, importEx);

  gen.add('ImportDeclaration', {
    pos,
    package: nominalImportEx,
    ex: importEx,
  }, declare);

  const funcDeclare = gen.add('FunctionDeclare', {
    pos,
    access,
    external: native('boolean'),
    name: native('string'),
    symbol,
    functionPhase,
    typeParams: list(typeParameterType),
    result: typeExpression,
    params: list(lambdaParameter),
    body: expression,
  }, declare, func);

  const structField = gen.add('StructField', {
    pos,
    type: typeExpression,
    default: optional(expression),
  });

  const dataLayout = gen.type('DataLayout');

  gen.add('Struct', {
    pos,
    symbol,
    typeParams: list(typeParameterType),
    fields: map(native('string'), structField),
    enum: optional(symbol),
  }, dataLayout);

  gen.add('Tuple', {
    pos,
    symbol,
    typeParams: list(typeParameterType),
    fields: list(typeExpression),
    enum: optional(symbol),
  }, dataLayout);

  gen.add('Atom', {
    pos,
    symbol,
    typeParams: list(typeParameterType),
    enum: optional(symbol),
  }, dataLayout);

  gen.add('DataDeclare', {
    pos,
    access,
    symbol,
    name: native('string'),
    typeParams: list(typeParameterType),
    layout: dataLayout,
  }, declare);

  gen.add('EnumDeclare', {
    pos,
    access,
    symbol,
    name: native('string'),
    typeParams: list(typeParameterType),
    variants: map(native('string'), dataLayout),
  }, declare);

  // TODO: handle protocol implementations in the future
  gen.add('ImplDeclare', {
    pos,
    symbol,
    typeParams: list(typeParameterType),
    base: concreteType,
    methods: map(native('string'), funcDeclare),
  }, declare);

  gen.add('ConstantDeclare', {
    pos,
    access,
    symbol,
    external: native('boolean'),
    name: native('string'),
    expression,
    type: typeExpression,
  }, declare);

  const file = gen.add('File', {
    src: native('string'),
    module: symbol,
    declarations: list(declare),
  });

  const accessRecord = gen.add('AccessRecord', {
    access,
    name: symbol,
    module: symbol,
    type: typeExpression,
  });

  gen.add('Package', {
    name: packageName,
    files: list(file),
    declarations: map(symbol, accessRecord),
    methods: map(symbol, map(native('string'), accessRecord)),
  });

  return gen;
}

function jsIr(): Generator {
  const gen = new Generator('Js');

  const expression = gen.type('Expression');
  const statement = gen.type('Statement');
  const declare = gen.type('Declaration');

  const block = gen.add("Block", {
    body: list(statement),
    result: expression,
  });

  for (const [name, lit] of [['Boolean', 'boolean'], ['Number', 'number'], ['String', 'string']] as const) {
    gen.add(`${name}LiteralEx`, {
      value: native(lit),
    }, expression);
  }

  const identifierEx = gen.add('IdentifierEx', {
    name: native('string'),
  }, expression);

  const lambda = gen.add('LambdaEx', {
    args: list(native('string')),
    body: list(statement),
  }, expression);

  const singleton = gen.add('Singleton', {
    init: expression,
  }, expression);

  const variable = gen.add('Variable', {
    init: expression,
  }, expression);

  const projection = gen.add('Projection', {
    base: expression,
    // TODO: in future projection might get more complex, once we have user-defined properties
    property: native('string'),
  }, expression);

  const flow = gen.add('Flow', {
    args: list(expression),
    body: lambda,
  }, expression);

  const def = gen.add('Def', {
    args: list(expression),
    body: lambda,
  }, expression);

  const flowGet = gen.add('FlowGet', {
    body: expression,
  }, expression);

  const undef = gen.add('Undefined', {}, expression);

  const array = gen.add('Array', {
    args: list(expression),
  }, expression);

  const constructField = gen.add('ConstructField', {
    name: native('string'),
    value: expression,
  });

  const construct = gen.add('Construct', {
    base: expression,
    fields: list(constructField),
  }, expression);

  const access = gen.add('Access', {
    base: expression,
    field: native('string'),
  }, expression);

  const call = gen.add('Call', {
    func: expression,
    args: list(expression),
  }, expression);

  const initVar = gen.add('DeclareVar', {
    name: native('string'),
  }, statement);

  const assignment = gen.add('Assign', {
    name: native('string'),
    body: expression,
  }, statement);

  const reassignment = gen.add('Reassign', {
    name: expression,
    body: expression,
  }, statement);

  const func = gen.add('FunctionStatement', {
    name: native('string'),
    args: list(native('string')),
    body: list(statement),
  }, statement);

  const returnStatement = gen.add('Return', {
    body: expression,
  }, statement);

  const ifStatement = gen.add('If', {
    condition: expression,
    thenBlock: list(statement),
    elseBlock: list(statement),
  }, statement);

  const binaryOp = gen.add('BinaryOp', {
    op: native('string'),
    left: expression,
    right: expression,
  }, expression);

  const unairyOp = gen.add('UnaryOp', {
    op: native('string'),
    base: expression,
  }, expression);

  const exprStatement = gen.add('ExpressionStatement', {
    base: expression,
  }, statement);

  const importDeclare = gen.add('Import', {
    from: native('string'),
    take: native('string'),
    as: optional(native('string')),
  }, declare);

  const exportDeclare = gen.add('Export', {
    name: native('string'),
  }, declare);

  const constDeclare = gen.add('Const', {
    export: native('boolean'),
    name: native('string'),
    body: expression,
  }, declare);

  const functionDeclare = gen.add('FunctionDeclare', {
    export: native('boolean'),
    func,
  }, declare);

  const dataLayout = gen.type('DataLayout');

  const structDeclare = gen.add('StructLayout', {
    name: native('string'),
    symbol,
    fields: set(native('string')),
  }, dataLayout);

  const tupleDeclare = gen.add('TupleLayout', {
    name: native('string'),
    symbol,
    fields: list(native('string')),
  }, dataLayout);

  const atomDeclare = gen.add('AtomLayout', {
    name: native('string'),
    symbol,
  }, dataLayout);

  const dataDeclare = gen.add('DataDeclare', {
    export: native('boolean'),
    layout: dataLayout,
  }, declare);

  const enumDeclare = gen.add('EnumDeclare', {
    export: native('boolean'),
    name: native('string'),
    symbol,
    variants: list(dataLayout),
  }, declare);

  const file = gen.add('File', {
    name: native('string'),
    main: native('boolean'),
    declarations: list(declare),
  });

  return gen;
}

const outputs = [
  ['src/parser/parserAst.ts', parser],
  ['src/checker/checkerAst.ts', checker],
  ['src/js/jsIr.ts', jsIr],
] as const;


for (const [targetFile, func] of outputs) {
  const out = createWriteStream(resolve(targetFile));

  await pipeline(
    Stream.Readable.from(func().generate()),
    out,
  )
}
