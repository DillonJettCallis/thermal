import {
  DependencyManager,
  Extern,
  type FunctionPhase, type Package,
  PackageName,
  Position,
  Symbol,
  TypeDictionary,
  Version
} from './ast.ts';
import { List, Map } from 'immutable';
import {
  CheckedAccessRecord,
  CheckedAtomType,
  type CheckedDataLayoutType,
  CheckedEnumType,
  CheckedFunctionType,
  CheckedFunctionTypeParameter,
  CheckedModuleType,
  CheckedNominalType,
  CheckedOverloadFunctionType,
  CheckedPackage,
  CheckedParameterizedType,
  CheckedStructType,
  CheckedTupleType,
  type CheckedTypeExpression,
  CheckedTypeParameterType
} from './checker/checkerAst.ts';
import { Parser } from './parser/parser.ts';
import { collectSymbols } from './checker/collector.ts';
import { verifyImports } from './checker/verifier.ts';
import { Checker } from './checker/checker.ts';
import {
  ParserConstantDeclare,
  ParserDataDeclare,
  type ParserDeclaration,
  ParserEnumDeclare, ParserFile,
  ParserFunctionDeclare,
  ParserImplDeclare, ParserPackage
} from './parser/parserAst.ts';

const coreVersion = new Version(0, 1, 0);
const corePackageName = new PackageName('core', 'core', coreVersion);
const coreSymbol = new Symbol(corePackageName);

const pos = new Position('<native>', 0, 0);

export function domLib(workingDir: string): ParserPackage {
  // TODO: dom lib needs to be prebuild, not checked per use case
  const version = new Version(0, 1, 0);
  const packageName = new PackageName('core', 'dom', version);
  const root = new Symbol(packageName);

  const allFiles = List.of(Parser.parseFile(`${workingDir}/lib/dom/dom.thermal`, root.child('dom')));

  return new ParserPackage({
    name: packageName,
    files: allFiles,
    externals: Map(),
  });
}

export function coreLib(workingDir: string): { package: ParserPackage, coreTypes: CoreTypes, preamble: Map<string, Symbol>, declarations: Map<Symbol, CheckedAccessRecord> } {
  const declarations = Map<Symbol, CheckedAccessRecord>().asMutable();

  const coreTypes: CoreTypes = {
    nothing: createStructType(coreSymbol, declarations, 'Nothing', [], {}),
    boolean: createStructType(coreSymbol.child('bool'), declarations, 'Boolean', [], {}),
    int: createStructType(coreSymbol.child('math'), declarations, 'Int', [], {}),
    float: createStructType(coreSymbol.child('math'), declarations, 'Float', [], {}),
    string: createStructType(coreSymbol.child('string'), declarations, 'String', [], {}),
    option: initOption(declarations),
    unit: createStructType(coreSymbol.child('base'), declarations, 'Unit', [], {}),
    optionOf(content: CheckedTypeExpression): CheckedTypeExpression {
      return new CheckedParameterizedType({
        base: this.option,
        args: List.of(
          content,
        ),
      });
    },
    list: createStructType(coreSymbol.child('vector'), declarations, 'Vec', ['Item'], {}),
    listOf(content: CheckedTypeExpression): CheckedTypeExpression {
      return new CheckedParameterizedType({
        base: this.list,
        args: List.of(
          content,
        ),
      });
    },
    set: createStructType(coreSymbol.child('set'), declarations, 'Set', ['Item'], {}),
    setOf(content: CheckedTypeExpression): CheckedTypeExpression {
      return new CheckedParameterizedType({
        base: this.set,
        args: List.of(
          content,
        ),
      });
    },
    map: createStructType(coreSymbol.child('map'), declarations, 'Map', ['Key', 'Value'], {}),
    mapOf(key: CheckedTypeExpression, value: CheckedTypeExpression): CheckedTypeExpression {
      return new CheckedParameterizedType({
        base: this.map,
        args: List.of(key, value),
      });
    },
  };

  const preamble = Map<string, Symbol>().asMutable();
  boolLib(declarations, coreTypes, preamble);
  mathLib(declarations, coreTypes, preamble);
  preamble.set('Boolean', coreTypes.boolean.name);
  preamble.set('String', coreTypes.string.name);
  preamble.set('Int', coreTypes.int.name);
  preamble.set('Float', coreTypes.float.name);
  preamble.set('Option', coreTypes.option.name);
  preamble.set('Unit', coreTypes.unit.name);
  preamble.set('Array', coreSymbol.child('array').child('Array'));
  preamble.set('List', coreSymbol.child('vector').child('Vec'));
  preamble.set('Map', coreSymbol.child('map').child('Map'));

  const externals = Map<Symbol, Extern>().asMutable();

  // TODO: this is a huge mess. Make core libs use explicit imports and not rely on the preamble, that will help solve the preamble bootstrap problem
  // TODO: core library needs to be pre-checked so we don't have to recheck when we're just trying to use it.
  const files = List.of('array', 'map', 'set', 'vector', 'bool', 'base', 'math', 'string')
    .map(key => {
      const parsed = Parser.parseFile(`${workingDir}/lib/core/${key}.thermal`, coreSymbol.child(key));

      handleNativeImpls(parsed.declarations, `../lib/core/${key}.ts`, externals);

      return parsed;
    });

  return {
    package: new ParserPackage({
      name: corePackageName,
      files,
      externals: externals.asImmutable(),
    }),
    coreTypes,
    preamble: preamble.asImmutable(),
    declarations: declarations.asImmutable(),
  };
}

function handleNativeImpls(content: List<ParserDeclaration>, srcFile: string, externs: Map<Symbol, Extern>): void {
  content.forEach(dec => {
    if (dec instanceof ParserImplDeclare) {
      dec.methods.forEach(method => {
        if (method.external) {
          externs.set(method.symbol, new Extern({
            symbol: method.symbol,
            srcFile,
            import: method.name === 'new' ? '_new' : method.name,
          }));
        }
      });
    }

    if (dec instanceof ParserFunctionDeclare && dec.external) {
      externs.set(dec.symbol, new Extern({
        symbol: dec.symbol,
        srcFile,
        import: dec.name === 'new' ? '_new' : dec.name,
      }));
    }

    if (dec instanceof ParserConstantDeclare && dec.external) {
      externs.set(dec.symbol, new Extern({
        symbol: dec.symbol,
        srcFile,
        import: dec.name === 'new' ? '_new' : dec.name,
      }));
    }

    if (dec instanceof ParserDataDeclare && dec.external) {
      externs.set(dec.symbol, new Extern({
        symbol: dec.symbol,
        srcFile,
        import: dec.name === 'new' ? '_new' : dec.name,
      }));
    }

    if (dec instanceof ParserEnumDeclare && dec.external) {
      externs.set(dec.symbol, new Extern({
        symbol: dec.symbol,
        srcFile,
        import: dec.name === 'new' ? '_new' : dec.name,
      }));

      for (const [name, layout] of dec.variants) {
        externs.set(layout.symbol, new Extern({
          symbol: layout.symbol,
          srcFile,
          import: name === 'new' ? '_new' : name,
        }));
      }
    }
  })
}

function initOption(declarations: Map<Symbol, CheckedAccessRecord>): CheckedNominalType {
  const option = coreSymbol.child("base").child('Option');
  const typeParams = typeParamList(option, ['Item']);

  return createEnumType(coreSymbol, option, declarations, typeParams, {
    Some: new CheckedTupleType({
      pos,
      name: option.child('Some'),
      typeParams,
      fields: typeParams,
      enum: option,
    }),
    None: new CheckedAtomType({
      pos,
      name: option.child('Option').child('None'),
      typeParams,
      enum: option,
    }),
  });
}

export interface CoreTypes {
  nothing: CheckedNominalType;
  boolean: CheckedNominalType;
  string: CheckedNominalType;
  int: CheckedNominalType;
  float: CheckedNominalType;
  unit: CheckedNominalType;

  list: CheckedNominalType;
  set: CheckedNominalType;
  map: CheckedNominalType;
  option: CheckedNominalType;

  optionOf(content: CheckedTypeExpression): CheckedTypeExpression;
  listOf(content: CheckedTypeExpression): CheckedTypeExpression;
  setOf(content: CheckedTypeExpression): CheckedTypeExpression;
  mapOf(key: CheckedTypeExpression, value: CheckedTypeExpression): CheckedTypeExpression;
}

function boolLib(declarations: Map<Symbol, CheckedAccessRecord>, coreTypes: CoreTypes, preamble: Map<string, Symbol>): void {
  const boolSymbol = coreSymbol.child('bool');

  declarations.set(boolSymbol, new CheckedAccessRecord({
    access: 'public',
    name: boolSymbol,
    module: boolSymbol,
    type: new CheckedModuleType({
      name: boolSymbol,
    }),
  }));

  declarations.set(boolSymbol.child('&&'), new CheckedAccessRecord({
    access: 'public',
    name: boolSymbol.child('&&'),
    module: boolSymbol,
    type: unphasedFunction([coreTypes.boolean, coreTypes.boolean], coreTypes.boolean),
  }));
  preamble.set('&&', boolSymbol.child('&&'));

  declarations.set(boolSymbol.child('||'), new CheckedAccessRecord({
    access: 'public',
    name: boolSymbol.child('||'),
    module: boolSymbol,
    type: unphasedFunction([coreTypes.boolean, coreTypes.boolean], coreTypes.boolean),
  }));
  preamble.set('||', boolSymbol.child('||'));

  declarations.set(boolSymbol.child('!'), new CheckedAccessRecord({
    access: 'public',
    name: boolSymbol.child('!'),
    module: boolSymbol,
    type: unphasedFunction([coreTypes.boolean], coreTypes.boolean),
  }));
  preamble.set('!', boolSymbol.child('!'));

  declarations.set(boolSymbol.child('=='), new CheckedAccessRecord({
    access: 'public',
    name: boolSymbol.child('=='),
    module: boolSymbol,
    type: unphasedFunction([coreTypes.nothing, coreTypes.nothing], coreTypes.boolean),
  }));
  preamble.set('==', boolSymbol.child('=='));

  declarations.set(boolSymbol.child('!='), new CheckedAccessRecord({
    access: 'public',
    name: boolSymbol.child('!='),
    module: boolSymbol,
    type: unphasedFunction([coreTypes.nothing, coreTypes.nothing], coreTypes.boolean),
  }));
  preamble.set('!=', boolSymbol.child('!='));
}

function mathLib(declarations: Map<Symbol, CheckedAccessRecord>, coreTypes: CoreTypes, preamble: Map<string, Symbol>): void {
  const mathSymbol = coreSymbol.child('math');

  const intType = coreTypes.int;
  const floatType = coreTypes.float;

  declarations.set(mathSymbol.child('+'), new CheckedAccessRecord({
    access: 'public',
    name: mathSymbol.child('+'),
    module: mathSymbol,
    type: new CheckedOverloadFunctionType({
      branches: List.of(
        unphasedFunction([intType, intType], intType),
        unphasedFunction([floatType, floatType], floatType),
      ),
    }),
  }));
  preamble.set('+', mathSymbol.child('+'));

  declarations.set(mathSymbol.child('-'), new CheckedAccessRecord({
    access: 'public',
    name: mathSymbol.child('-'),
    module: mathSymbol,
    type: new CheckedOverloadFunctionType({
      branches: List.of(
        // unary versions
        unphasedFunction([intType], intType),
        unphasedFunction([floatType], floatType),

        // binary versions
        unphasedFunction([intType, intType], intType),
        unphasedFunction([floatType, floatType], floatType),
      ),
    }),
  }));
  preamble.set('-', mathSymbol.child('-'));

  declarations.set(mathSymbol.child('*'), new CheckedAccessRecord({
    access: 'public',
    name: mathSymbol.child('*'),
    module: mathSymbol,
    type: new CheckedOverloadFunctionType({
      branches: List.of(
        unphasedFunction([intType, intType], intType),
        unphasedFunction([floatType, floatType], floatType),
      ),
    }),
  }));
  preamble.set('*', mathSymbol.child('*'));

  declarations.set(mathSymbol.child('/'), new CheckedAccessRecord({
    access: 'public',
    name: mathSymbol.child('/'),
    module: mathSymbol,
    type: new CheckedOverloadFunctionType({
      branches: List.of(
        unphasedFunction([intType, intType], floatType),
        unphasedFunction([floatType, floatType], floatType),
      ),
    }),
  }));
  preamble.set('/', mathSymbol.child('/'));

  // all compare ops work on all number type combinations
  ['>', '>=', '<', '<='].forEach(op => {
    declarations.set(mathSymbol.child(op), new CheckedAccessRecord({
      access: 'public',
      name: mathSymbol.child(op),
      module: mathSymbol,
      type: new CheckedOverloadFunctionType({
        branches: List.of(
          unphasedFunction([intType, intType], coreTypes.boolean),
          unphasedFunction([floatType, intType], coreTypes.boolean),
          unphasedFunction([intType, floatType], coreTypes.boolean),
          unphasedFunction([floatType, floatType], coreTypes.boolean),
        ),
      }),
    }));
    preamble.set(op, mathSymbol.child(op));
  });

  const integerDivisionResultType = createStructType(mathSymbol, declarations, 'IntegerDivisionResult', [], {
    dividend: intType,
    remainder: intType,
  });

  declarations.set(mathSymbol.child('integerDivision'), new CheckedAccessRecord({
    access: 'public',
    name: mathSymbol.child('integerDivision'),
    module: mathSymbol,
    type: unphasedFunction([intType, intType], integerDivisionResultType),
  }));
  declarations.set(mathSymbol.child('remainder'), new CheckedAccessRecord({
    access: 'public',
    name: mathSymbol.child('remainder'),
    module: mathSymbol,
    type: unphasedFunction([intType, intType], intType),
  }));
}

function createStructType(parent: Symbol, declarations: Map<Symbol, CheckedAccessRecord>, baseName: string, typeParams: Array<string>, fields: Record<string, CheckedTypeExpression>): CheckedNominalType {
  const name = parent.child(baseName);

  const type = new CheckedNominalType({
    name,
  });

  declarations.set(name, new CheckedAccessRecord({
    access: 'public',
    name,
    module: parent,
    type: new CheckedStructType({
      pos,
      name,
      typeParams: List(typeParams).map(it => {
        return new CheckedTypeParameterType({
          name: name.child(it),
        });
      }),
      fields: Map(fields),
      enum: undefined,
    }),
  }));

  return type;
}

function createEnumType(module: Symbol, name: Symbol, declarations: Map<Symbol, CheckedAccessRecord>, typeParams: List<CheckedTypeParameterType>, variants: Record<string, CheckedDataLayoutType>): CheckedNominalType {
  const type = new CheckedNominalType({
    name,
  });

  declarations.set(name, new CheckedAccessRecord({
    access: 'public',
    name,
    module,
    type: new CheckedEnumType({
      pos,
      name,
      typeParams,
      variants: Map(variants),
    }),
  }));

  return type;
}

function typeParamList(owner: Symbol, params: Array<string>): List<CheckedTypeParameterType> {
  return List(params).map(it => {
    return new CheckedTypeParameterType({
      name: owner.child(it),
    });
  });
}

function unphasedFunction(args: Array<CheckedTypeExpression>, result: CheckedTypeExpression, phase: FunctionPhase = 'fun'): CheckedFunctionType {
  return new CheckedFunctionType({
    phase,
    typeParams: List(),
    params: List(args).map(type => {
      return new CheckedFunctionTypeParameter({
        phase: undefined,
        type,
      });
    }),
    result,
  });
}
