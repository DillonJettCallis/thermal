import {
  DependencyManager,
  type FunctionPhase,
  PackageName,
  Position,
  Symbol,
  TypeDictionary,
  Version
} from './ast.ts';
import { List, Map, Record as ImmutableRecord } from 'immutable';
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

const coreVersion = new Version(0, 1, 0);
const corePackageName = new PackageName('core', 'core', coreVersion);
const coreSymbol = new Symbol(corePackageName);

const pos = new Position('<native>', 0, 0);

export class Extern extends ImmutableRecord({
  symbol: undefined as unknown as Symbol,
  // TODO: replace this with target-specifics
  srcFile: '',
  import: '',
}) {
}

export function domLib(workingDir: string, corePackage: CheckedPackage, coreTypes: CoreTypes, rootManager: DependencyManager, preamble: Map<string, Symbol>): CheckedPackage {
  const version = new Version(0, 1, 0);
  const packageName = new PackageName('core', 'dom', version);
  const root = new Symbol(packageName);

  const allFiles = List.of(Parser.parseFile(`${workingDir}/core/dom.thermal`, root.child('dom')));
  // const allFiles = [Parser.parseFile(`${dir}/simple.thermal`, root.child('simple'))];
  const typeDict = new TypeDictionary();
  typeDict.loadPackage(corePackage.declarations, Map());

  const { symbols, methods } = collectSymbols(allFiles, rootManager, preamble);
  typeDict.loadPackage(symbols, methods);

  const allProgramSymbols = Map<PackageName, Map<Symbol, CheckedAccessRecord>>().asMutable();
  allProgramSymbols.set(corePackage.name, corePackage.declarations);
  allProgramSymbols.set(packageName, symbols);

  // throws exception if an import is invalid
  verifyImports(allFiles, rootManager, typeDict);

  const checker = new Checker(rootManager, typeDict, coreTypes, preamble);

  const checkedFiles = List(allFiles.map(file => checker.checkFile(file)));

  return new CheckedPackage({
    name: packageName,
    files: checkedFiles,
    declarations: symbols,
  });
}

export function coreLib(): { package: CheckedPackage, coreTypes: CoreTypes, preamble: Map<string, Symbol> } {
  const declarations = Map<Symbol, CheckedAccessRecord>().asMutable();

  const coreTypes: CoreTypes = {
    any: createStructType(coreSymbol, declarations, 'Any', [], {}),
    nothing: createStructType(coreSymbol, declarations, 'Nothing', [], {}),
    boolean: createStructType(coreSymbol.child('bool'), declarations, 'Boolean', [], {}),
    int: createStructType(coreSymbol.child('math'), declarations, 'Int', [], {}),
    float: createStructType(coreSymbol.child('math'), declarations, 'Float', [], {}),
    string: createStructType(coreSymbol.child('string'), declarations, 'String', [], {}),
    option: initOption(declarations),
    unit: createStructType(coreSymbol, declarations, 'Unit', [], {}),
    optionOf(content: CheckedTypeExpression): CheckedTypeExpression {
      return new CheckedParameterizedType({
        base: this.option,
        args: List.of(
          content,
        ),
      });
    },
    list: createStructType(coreSymbol.child('list'), declarations, 'List', ['Item'], {}),
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
  stringLib(declarations, coreTypes, preamble);
  listLib(declarations, coreTypes);
  mapLib(declarations, coreTypes);

  preamble.set('Any', coreTypes.any.name);
  preamble.set('Boolean', coreTypes.boolean.name);
  preamble.set('String', coreTypes.string.name);
  preamble.set('Int', coreTypes.int.name);
  preamble.set('Float', coreTypes.float.name);
  preamble.set('Option', coreTypes.option.name);
  preamble.set('Unit', coreTypes.unit.name);
  preamble.set('List', coreTypes.list.name);
  preamble.set('Map', coreTypes.map.name);

  declarations.set(coreSymbol, new CheckedAccessRecord({
    access: 'public',
    name: coreSymbol,
    module: coreSymbol,
    type: new CheckedModuleType({
      name: coreSymbol,
    }),
  }));
  preamble.set('core', coreSymbol);

  return {
    package: new CheckedPackage({
      name: corePackageName,
      files: List(),
      declarations,
    }),
    coreTypes,
    preamble: preamble.asImmutable(),
  };
}

function initOption(declarations: Map<Symbol, CheckedAccessRecord>): CheckedNominalType {
  const option = coreSymbol.child('Option');
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
  any: CheckedNominalType;
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
    type: new CheckedOverloadFunctionType({
      branches: List.of(
        unphasedFunction([coreTypes.boolean, coreTypes.boolean], coreTypes.boolean),
        unphasedFunction([coreTypes.int, coreTypes.int], coreTypes.boolean),
        unphasedFunction([coreTypes.float, coreTypes.float], coreTypes.boolean),
        unphasedFunction([coreTypes.string, coreTypes.string], coreTypes.boolean),
      ),
    }),
  }));
  preamble.set('==', boolSymbol.child('=='));

  declarations.set(boolSymbol.child('!='), new CheckedAccessRecord({
    access: 'public',
    name: boolSymbol.child('!='),
    module: boolSymbol,
    type: new CheckedOverloadFunctionType({
      branches: List.of(
        unphasedFunction([coreTypes.boolean, coreTypes.boolean], coreTypes.boolean),
        unphasedFunction([coreTypes.int, coreTypes.int], coreTypes.boolean),
        unphasedFunction([coreTypes.float, coreTypes.float], coreTypes.boolean),
        unphasedFunction([coreTypes.string, coreTypes.string], coreTypes.boolean),
      ),
    }),
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

function stringLib(declarations: Map<Symbol, CheckedAccessRecord>, coreTypes: CoreTypes, preamble: Map<string, Symbol>): void {
  const stringSymbol = coreSymbol.child('string').child('String');

  declarations.set(stringSymbol.child('toString'), new CheckedAccessRecord({
    access: 'public',
    name: stringSymbol.child('toString'),
    module: stringSymbol,
    type: new CheckedOverloadFunctionType({
      branches: List.of(
        unphasedFunction([coreTypes.boolean], coreTypes.string),
        unphasedFunction([coreTypes.int], coreTypes.string),
        unphasedFunction([coreTypes.float], coreTypes.string),
      ),
    }),
  }));
  preamble.set('toString', stringSymbol.child('toString'));

  const concatSymbol = stringSymbol.child("stringConcat");
  declarations.set(concatSymbol, new CheckedAccessRecord({
    access: 'public',
    name: concatSymbol,
    module: stringSymbol,
    type: new CheckedFunctionType({
      phase: 'fun',
      typeParams: List(),
      params: List.of(
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.string,
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.string,
        }),
      ),
      result: coreTypes.string,
    }),
  }));
  preamble.set('stringConcat', concatSymbol);
}

function listLib(declarations: Map<Symbol, CheckedAccessRecord>, coreTypes: CoreTypes): void {
  const listSymbol =  coreSymbol.child('list').child('List');
  const itemSymbol = listSymbol.child('item');
  const itemTypeParam = new CheckedTypeParameterType({
    name: itemSymbol,
  });

  declarations.set(listSymbol, new CheckedAccessRecord({
    access: 'public',
    name: listSymbol,
    module: listSymbol,
    type: new CheckedModuleType({
      name: listSymbol,
    }),
  }));

  declarations.set(listSymbol.child('get'), new CheckedAccessRecord({
    access: 'public',
    name: listSymbol.child('get'),
    module: listSymbol,
    type: new CheckedFunctionType({
      phase: 'fun',
      typeParams: List.of(itemTypeParam),
      params: List.of(
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.listOf(itemTypeParam),
        }), new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.int,
        }),
      ),
      result: itemTypeParam,
    }),
  }));

  const mapSymbol = listSymbol.child('map');
  const mapOutSymbol = mapSymbol.child('Out');
  const mapOutTypeParam = new CheckedTypeParameterType({
    name: mapOutSymbol,
  });

  declarations.set(mapSymbol, new CheckedAccessRecord({
    access: 'public',
    name: mapSymbol,
    module: listSymbol,
    type: new CheckedFunctionType({
      phase: 'fun',
      typeParams: List.of(itemTypeParam, mapOutTypeParam),
      params: List.of(
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.listOf(itemTypeParam),
        }), new CheckedFunctionTypeParameter({
          phase: undefined,
          type: new CheckedFunctionType({
            phase: 'fun',
            typeParams: List(),
            params: List.of(
              new CheckedFunctionTypeParameter({
                phase: 'val',
                type: itemTypeParam,
              }),
            ),
            result: mapOutTypeParam,
          }),
        }),
      ),
      result: coreTypes.listOf(mapOutTypeParam),
    }),
  }));

  const flatMapSymbol = listSymbol.child('flatMap');
  declarations.set(flatMapSymbol, new CheckedAccessRecord({
    access: 'public',
    name: flatMapSymbol,
    module: listSymbol,
    type: new CheckedFunctionType({
      phase: 'fun',
      typeParams: List.of(itemTypeParam, mapOutTypeParam),
      params: List.of(
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.listOf(itemTypeParam),
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: new CheckedFunctionType({
            phase: 'fun',
            typeParams: List(),
            params: List.of(
              new CheckedFunctionTypeParameter({
                phase: 'val',
                type: itemTypeParam,
              }),
            ),
            result: coreTypes.listOf(mapOutTypeParam),
          }),
        }),
      ),
      result: coreTypes.listOf(mapOutTypeParam),
    }),
  }));

  const concatSymbol = listSymbol.child('concat');
  declarations.set(concatSymbol, new CheckedAccessRecord({
    access: 'public',
    name: concatSymbol,
    module: listSymbol,
    type: new CheckedFunctionType({
      phase: 'fun',
      typeParams: List.of(itemTypeParam),
      params: List.of(
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.listOf(itemTypeParam)
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.listOf(itemTypeParam)
        })
      ),
      result: new CheckedFunctionTypeParameter({
        phase: undefined,
        type: coreTypes.listOf(itemTypeParam)
      })
    })
  }));

  const foldSymbol = listSymbol.child('fold');
  declarations.set(foldSymbol, new CheckedAccessRecord({
    access: 'public',
    name: foldSymbol,
    module: listSymbol,
    type: new CheckedFunctionType({
      phase: 'fun',
      typeParams: List.of(itemTypeParam, mapOutTypeParam),
      params: List.of(
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.listOf(itemTypeParam),
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: mapOutTypeParam,
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: new CheckedFunctionType({
            phase: 'fun',
            typeParams: List(),
            params: List.of(
              new CheckedFunctionTypeParameter({
                phase: undefined,
                type: mapOutTypeParam,
              }),
              new CheckedFunctionTypeParameter({
                phase: undefined,
                type: itemTypeParam,
              }),
            ),
            result: mapOutTypeParam,
          })
        })
      ),
      result: mapOutTypeParam,
    }),
  }))
}

function mapLib(declarations: Map<Symbol, CheckedAccessRecord>, coreTypes: CoreTypes): void {
  const mapSymbol =  coreSymbol.child('map').child('Map');
  const keySymbol = mapSymbol.child('Key');
  const valueSymbol = mapSymbol.child('Value');
  const keyTypeParam = new CheckedTypeParameterType({
    name: keySymbol,
  });
  const valueTypeParam = new CheckedTypeParameterType({
    name: valueSymbol,
  });

  const setSymbol = mapSymbol.child('set');
  declarations.set(setSymbol, new CheckedAccessRecord({
    access: 'public',
    name: setSymbol,
    module: mapSymbol,
    type: new CheckedFunctionType({
      phase: 'fun',
      typeParams: List.of(keyTypeParam, valueTypeParam),
      params: List.of(
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.mapOf(keyTypeParam, valueTypeParam),
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: keyTypeParam,
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: valueTypeParam,
        }),
      ),
      result: coreTypes.mapOf(keyTypeParam, valueTypeParam),
    }),
  }));

  const updateSymbol = mapSymbol.child('update');
  declarations.set(updateSymbol, new CheckedAccessRecord({
    access: 'public',
    name: updateSymbol,
    module: mapSymbol,
    type: new CheckedFunctionType({
      phase: 'fun',
      typeParams: List.of(keyTypeParam, valueTypeParam),
      params: List.of(
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: coreTypes.mapOf(keyTypeParam, valueTypeParam),
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: keyTypeParam,
        }),
        new CheckedFunctionTypeParameter({
          phase: undefined,
          type: new CheckedFunctionType({
            phase: 'fun',
            typeParams: List(),
            params: List.of(
              new CheckedFunctionTypeParameter({
                phase: undefined,
                type: valueTypeParam,
              }),
            ),
            result: valueTypeParam,
          }),
        }),
      ),
      result: coreTypes.mapOf(keyTypeParam, valueTypeParam),
    }),
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
