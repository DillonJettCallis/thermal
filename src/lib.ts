import {
  EnumTypeVariant,
  FunctionPhase,
  UncheckedFunctionType,
  Package,
  UncheckedNominalType,
  Position,
  Symbol,
  UncheckedTypeExpression,
  Version,
  TypeExpression,
  Access,
  NominalType,
  FunctionType,
  FunctionTypeParameter,
  AccessRecord,
  PackageName,
  ParameterizedType, TypeParameterType, ModuleType
} from "./ast.js";
import { List, Map } from 'immutable';

const coreVersion = new Version(0, 1, 0);
const corePackageName = new PackageName('core', 'core', coreVersion);
const coreSymbol = new Symbol(corePackageName);

const pos = new Position('<native>', 0, 0);

export function coreLib(): { package: Package, coreTypes: CoreTypes, preamble: Map<string, Symbol> } {
  const declarations = Map<Symbol, AccessRecord>().asMutable();

  const coreTypes: CoreTypes = {
    any: createStructType(coreSymbol, declarations, 'Any', [], {}),
    nothing: createStructType(coreSymbol, declarations, 'Nothing', [], {}),
    boolean: createStructType(coreSymbol.child('bool'), declarations, 'Boolean', [], {}),
    int: createStructType(coreSymbol.child('math'), declarations, 'Int', [], {}),
    float: createStructType(coreSymbol.child('math'), declarations, 'Float', [], {}),
    string: createStructType(coreSymbol.child('string'), declarations, 'String', [], {}),
    option: createEnumType(coreSymbol.child('option'), declarations, 'Option', ['Item'], {
      Some: {
        pos,
        kind: 'enumTuple',
        name: coreSymbol.child('option').child('Option').child('Some'),
        fields: [
          {
            kind: 'nominal',
            pos,
            name: coreSymbol.child('option').child('Option').child('Item'),
          }
        ]
      },
      None: {
        pos,
        kind: 'enumAtom',
        name: coreSymbol.child('option').child('Option').child('None'),
      }
    }),
    unit: createStructType(coreSymbol, declarations, 'Unit', [], {}),
    optionOf(content: TypeExpression): TypeExpression {
      return {
        pos,
        kind: 'parameterized',
        base: this.option,
        args: [
          content,
        ]
      };
    },
    list: createStructType(coreSymbol.child('list'), declarations, 'List', ['Item'], {}),
    listOf(content: TypeExpression): TypeExpression {
      return {
        pos,
        kind: 'parameterized',
        base: this.list,
        args: [
          content,
        ],
      }
    },
    set: createStructType(coreSymbol.child('set'), declarations, 'Set', ['Item'], {}),
    setOf(content: TypeExpression): TypeExpression {
      return {
        pos,
        kind: 'parameterized',
        base: this.set,
        args: [
          content,
        ],
      }
    },
    map: createStructType(coreSymbol.child('map'), declarations, 'Map', ['Key', 'Value'], {}),
    mapOf(key: TypeExpression, value: TypeExpression): TypeExpression {
      return {
        pos,
        kind: 'parameterized',
        base: this.map,
        args: [key, value],
      }
    }
  }

  const preamble = Map<string, Symbol>().asMutable();

  boolLib(declarations, coreTypes, preamble);
  mathLib(declarations, coreTypes, preamble);
  stringLib(declarations, coreTypes, preamble);
  domLib(declarations, coreTypes);
  listLib(declarations, coreTypes);

  preamble.set('Any', coreTypes.any.name);
  preamble.set('Boolean', coreTypes.boolean.name);
  preamble.set('String', coreTypes.string.name);
  preamble.set('Int', coreTypes.int.name);
  preamble.set('Float', coreTypes.float.name);
  preamble.set('Option', coreTypes.option.name);
  preamble.set('Unit', coreTypes.unit.name);
  preamble.set('List', coreTypes.list.name);

  declarations.set(coreSymbol, {
    access: 'public',
    module: coreSymbol,
    type: {
      pos,
      kind: 'module',
      name: coreSymbol,
    } satisfies ModuleType
  });
  preamble.set('core', coreSymbol);

  return {
    package: {
      name: corePackageName,
      files: [],
      declarations,
    },
    coreTypes,
    preamble: preamble.asImmutable(),
  }
}

export interface CoreTypes {
  any: NominalType;
  nothing: NominalType;
  boolean: NominalType;
  string: NominalType;
  int: NominalType;
  float: NominalType;
  unit: NominalType;

  list: NominalType;
  set: NominalType;
  map: NominalType;
  option: NominalType;

  optionOf(content: TypeExpression): TypeExpression;
  listOf(content: TypeExpression): TypeExpression;
  setOf(content: TypeExpression): TypeExpression;
  mapOf(key: TypeExpression, value: TypeExpression): TypeExpression;
}

function boolLib(declarations: Map<Symbol, AccessRecord>, coreTypes: CoreTypes, preamble: Map<string, Symbol>): void {
  const boolSymbol = coreSymbol.child('bool');

  declarations.set(boolSymbol.child('&&'), {
    access: 'public',
    module: boolSymbol,
    type: unphasedFunction([coreTypes.boolean, coreTypes.boolean], coreTypes.boolean),
  });
  preamble.set('&&', boolSymbol.child('&&'));

  declarations.set(boolSymbol.child('||'), {
    access: 'public',
    module: boolSymbol,
    type: unphasedFunction([coreTypes.boolean, coreTypes.boolean], coreTypes.boolean),
  });
  preamble.set('||', boolSymbol.child('||'));

  declarations.set(boolSymbol.child('!'), {
    access: 'public',
    module: boolSymbol,
    type: unphasedFunction([coreTypes.boolean], coreTypes.boolean),
  });
  preamble.set('!', boolSymbol.child('!'));

  declarations.set(boolSymbol.child('=='), {
    access: 'public',
    module: boolSymbol,
    type: {
      pos,
      kind: 'overloadFunction',
      branches: [
        unphasedFunction([coreTypes.boolean, coreTypes.boolean], coreTypes.boolean),
        unphasedFunction([coreTypes.int, coreTypes.int], coreTypes.boolean),
        unphasedFunction([coreTypes.string, coreTypes.string], coreTypes.boolean),
      ]
    }
  });
  preamble.set('==', boolSymbol.child('=='));

  declarations.set(boolSymbol.child('!='), {
    access: 'public',
    module: boolSymbol,
    type: {
      pos,
      kind: 'overloadFunction',
      branches: [
        unphasedFunction([coreTypes.boolean, coreTypes.boolean], coreTypes.boolean),
        unphasedFunction([coreTypes.int, coreTypes.int], coreTypes.boolean),
        unphasedFunction([coreTypes.string, coreTypes.string], coreTypes.boolean),
      ]
    }
  });
  preamble.set('!=', boolSymbol.child('!='));
}

function mathLib(declarations: Map<Symbol, AccessRecord>, coreTypes: CoreTypes, preamble: Map<string, Symbol>): void {
  const mathSymbol = coreSymbol.child('math');

  const intType = coreTypes.int;
  const floatType = coreTypes.float;

  declarations.set(mathSymbol.child('+'), {
    access: 'public',
    module: mathSymbol,
    type: {
      pos,
      kind: 'overloadFunction',
      branches: [
        unphasedFunction([intType, intType], intType),
        unphasedFunction([floatType, intType], floatType),
        unphasedFunction([intType, floatType], floatType),
        unphasedFunction([floatType, floatType], floatType),
      ]
    }
  });
  preamble.set('+', mathSymbol.child('+'));

  declarations.set(mathSymbol.child('-'), {
    access: 'public',
    module: mathSymbol,
    type: {
      pos,
      kind: 'overloadFunction',
      branches: [
        // unary versions
        unphasedFunction([intType], intType),
        unphasedFunction([floatType], floatType),

        // binary versions
        unphasedFunction([intType, intType], intType),
        unphasedFunction([floatType, intType], floatType),
        unphasedFunction([intType, floatType], floatType),
        unphasedFunction([floatType, floatType], floatType),
      ]
    }
  });
  preamble.set('-', mathSymbol.child('-'));

  declarations.set(mathSymbol.child('*'), {
    access: 'public',
    module: mathSymbol,
    type: {
      pos,
      kind: 'overloadFunction',
      branches: [
        unphasedFunction([intType, intType], intType),
        unphasedFunction([floatType, intType], floatType),
        unphasedFunction([intType, floatType], floatType),
        unphasedFunction([floatType, floatType], floatType),
      ]
    }
  });
  preamble.set('*', mathSymbol.child('*'));

  declarations.set(mathSymbol.child('/'), {
    access: 'public',
    module: mathSymbol,
    type: {
      pos,
      kind: 'overloadFunction',
      branches: [
        unphasedFunction([intType, intType], floatType),
        unphasedFunction([floatType, intType], floatType),
        unphasedFunction([intType, floatType], floatType),
        unphasedFunction([floatType, floatType], floatType),
      ]
    }
  });
  preamble.set('/', mathSymbol.child('/'));

  // all compare ops work on all number type combinations
  ['>', '>=', '<', '<='].forEach(op => {
    declarations.set(mathSymbol.child(op), {
      access: 'public',
      module: mathSymbol,
      type: {
        pos,
        kind: 'overloadFunction',
        branches: [
          unphasedFunction([intType, intType], coreTypes.boolean),
          unphasedFunction([floatType, intType], coreTypes.boolean),
          unphasedFunction([intType, floatType], coreTypes.boolean),
          unphasedFunction([floatType, floatType], coreTypes.boolean),
        ]
      }
    });
    preamble.set(op, mathSymbol.child(op));
  })

  const integerDivisionResultType = createStructType(mathSymbol, declarations, 'IntegerDivisionResult', [], {
    dividend: intType,
    remainder: intType,
  });

  declarations.set(mathSymbol.child('integerDivision'), {
    access: 'public',
    module: mathSymbol,
    type: unphasedFunction([intType, intType], integerDivisionResultType),
  });
  declarations.set(mathSymbol.child('remainder'), {
    access: 'public',
    module: mathSymbol,
    type: unphasedFunction([intType, intType], intType),
  });
}

function stringLib(declarations: Map<Symbol, AccessRecord>, coreTypes: CoreTypes, preamble: Map<string, Symbol>): void {
  const stringSymbol = coreSymbol.child('string');

  declarations.set(stringSymbol.child('toString'), {
    access: 'public',
    module: stringSymbol,
    type: {
      pos,
      kind: 'overloadFunction',
      branches: [
        unphasedFunction([coreTypes.boolean], coreTypes.string),
        unphasedFunction([coreTypes.int], coreTypes.string),
        unphasedFunction([coreTypes.float], coreTypes.string),
      ]
    }
  });
  preamble.set('toString', stringSymbol.child('toString'));
}

function domLib(declarations: Map<Symbol, AccessRecord>, coreTypes: CoreTypes): void {
  const domSymbol = coreSymbol.child('dom');
  declarations.set(domSymbol, {
    access: 'public',
    module: domSymbol,
    type: { pos, kind: 'module', name: domSymbol },
  });

  const attributeType = createStructType(domSymbol, declarations, 'Attribute', [], {});
  const elementSymbol = domSymbol.child('Element');
  const elementType: NominalType = {
    pos,
    kind: 'nominal',
    name: elementSymbol,
  };

  createEnumType(domSymbol, declarations, 'Element', [], {
    Tag: {
      pos,
      kind: 'enumStruct',
      name: elementSymbol.child('Tag'),
      fields: Map({
        name: coreTypes.string,
        attributes: coreTypes.mapOf(coreTypes.string, attributeType),
        body: coreTypes.listOf(elementType),
      }),
    },
    Text: {
      pos,
      kind: 'enumTuple',
      name: elementSymbol.child('Text'),
      fields: [
        coreTypes.string,
      ]
    }
  });

  const elemSymbol = domSymbol.child('elem');

  ['a', 'button', 'div', 'label'].forEach(tag => {
    declarations.set(elemSymbol.child(tag), {
      access: 'public',
      module: elemSymbol,
      type: {
        pos,
        kind: 'function',
        phase: 'fun',
        typeParams: [],
        params: [{
          pos,
          phase: undefined,
          type: coreTypes.listOf(attributeType),
        }, {
          pos,
          phase: undefined,
          type: coreTypes.listOf(elementType),
        }],
        result: elementType,
      }
    })
  });

  declarations.set(elemSymbol.child('text'), {
    access: 'public',
    module: elemSymbol,
    type: {
      pos,
      kind: 'function',
      phase: 'fun',
      typeParams: [],
      params: [{
        pos,
        phase: undefined,
        type: coreTypes.string,
      }],
      result: elementType,
    }
  });

  declarations.set(elemSymbol, {
    access: 'public',
    module: elemSymbol,
    type: { pos, kind: 'module', name: elemSymbol },
  });

  const styleSymbol = domSymbol.child('style');
  declarations.set(styleSymbol, {
    access: 'public',
    module: styleSymbol,
    type: { pos, kind: 'module', name: styleSymbol },
  });

  const displayEnumType = createEnumType(styleSymbol, declarations, 'Display', [], Object.fromEntries(['Block', 'InlineBlock', 'Flex'].map(variant => {
    return [variant, {
      pos,
      kind: 'enumAtom',
      name: styleSymbol.child('Display').child(variant)
    }] as const
  })));

  declarations.set(styleSymbol.child('display'), {
    access: 'public',
    module: styleSymbol,
    type: {
      pos,
      kind: 'function',
      phase: 'fun',
      typeParams: [],
      params: [{
        pos,
        phase: undefined,
        type: displayEnumType,
      }],
      result: attributeType,
    }
  });

  const flexDirectionEnumType = createEnumType(styleSymbol, declarations, 'FlexDirection', [], Object.fromEntries(['Row', 'Column'].map(variant => {
    return [variant, {
      pos,
      kind: 'enumAtom',
      name: styleSymbol.child('FlexDirection').child(variant)
    }] as const
  })));

  declarations.set(styleSymbol.child('flexDirection'), {
    access: 'public',
    module: styleSymbol,
    type: {
      pos,
      kind: 'function',
      phase: 'fun',
      typeParams: [],
      params: [{
        pos,
        phase: undefined,
        type: flexDirectionEnumType,
      }],
      result: attributeType,
    }
  });

  const scalarType = createEnumType(styleSymbol, declarations, 'Scalar', [], {
    Px: {
      pos,
      kind: "enumTuple",
      name: styleSymbol.child('Scalar').child('Px'),
      fields: [coreTypes.int],
    }
  });

  declarations.set(styleSymbol.child('px'), {
    access: 'public',
    module: styleSymbol,
    type: {
      pos,
      kind: 'function',
      phase: 'fun',
      typeParams: [],
      params: [{
        pos,
        phase: undefined,
        type: coreTypes.int,
      }],
      result: scalarType,
    }
  });

  declarations.set(styleSymbol.child('gap'), {
    access: 'public',
    module: styleSymbol,
    type: {
      pos,
      kind: 'function',
      phase: 'fun',
      typeParams: [],
      params: [{
        pos,
        phase: undefined,
        type: scalarType,
      }],
      result: attributeType,
    }
  });

  const attrSymbol = domSymbol.child('attr');
  declarations.set(attrSymbol, {
    access: 'public',
    module: attrSymbol,
    type: { pos, kind: 'module', name: attrSymbol },
  });

  declarations.set(attrSymbol.child('onClick'), {
    access: 'public',
    module: styleSymbol,
    type: {
      pos,
      kind: 'function',
      phase: 'fun',
      typeParams: [],
      params: [{
        pos,
        phase: undefined,
        type: {
          pos,
          kind: 'function',
          phase: 'sig',
          typeParams: [],
          params: [],
          result: coreTypes.boolean,
        },
      }],
      result: attributeType,
    }
  });

  const headType = createStructType(domSymbol, declarations, 'Head', [], {
    title: coreTypes.string,
  });

  const bodyType = createStructType(domSymbol, declarations, 'Body', [], {
    content: coreTypes.listOf(elementType),
  });

  createStructType(domSymbol, declarations, 'Html', [], {
    head: headType,
    body: bodyType,
  });
}

function listLib(declarations: Map<Symbol, AccessRecord>, coreTypes: CoreTypes): void {
  const listSymbol =  coreSymbol.child('list');
  const itemSymbol = listSymbol.child('item');
  const itemTypeParam = {
    pos,
    kind: 'typeParameter',
    name: itemSymbol,
  } satisfies TypeParameterType;

  declarations.set(listSymbol, {
    access: 'public',
    module: listSymbol,
    type: {
      pos,
      kind: 'module',
      name: listSymbol,
    } satisfies ModuleType,
  });

  declarations.set(listSymbol.child('get'), {
    access: 'public',
    module: listSymbol,
    type: {
      pos,
      kind: 'function',
      phase: 'fun',
      typeParams: [itemTypeParam],
      params: [{
        pos,
        phase: undefined,
        type: coreTypes.listOf(itemTypeParam),
      }, {
        pos,
        phase: undefined,
        type: coreTypes.int,
      }],
      result: itemTypeParam,
    }
  });

  const mapSymbol = listSymbol.child('map');
  const mapOutSymbol = mapSymbol.child('Out');
  const mapOutTypeParam = {
    pos,
    kind: 'typeParameter',
    name: mapOutSymbol,
  } satisfies TypeParameterType;

  declarations.set(mapSymbol, {
    access: 'public',
    module: listSymbol,
    type: {
      pos,
      kind: 'function',
      phase: 'fun',
      typeParams: [itemTypeParam, mapOutTypeParam],
      params: [{
        pos,
        phase: undefined,
        type: coreTypes.listOf(itemTypeParam),
      }, {
        pos,
        phase: undefined,
        type: {
          pos,
          kind: 'function',
          phase: 'fun',
          typeParams: [],
          params: [{
            pos,
            phase: 'val',
            type: itemTypeParam,
          }],
          result: mapOutTypeParam,
        } satisfies FunctionType,
      }],
      result: coreTypes.listOf(mapOutTypeParam),
    } satisfies FunctionType,
  });
}

function createStructType(parent: Symbol, declarations: Map<Symbol, AccessRecord>, baseName: string, typeParams: string[], fields: {
  [key: string]: TypeExpression
}): NominalType {
  const name = parent.child(baseName);

  const type: NominalType = {
    pos,
    kind: 'nominal',
    name,
  };

  declarations.set(name, {
    access: 'public',
    module: parent,
    type: {
      pos,
      kind: 'struct',
      name,
      typeParams: typeParams.map(it => {
        return {
          pos,
          kind: 'typeParameter',
          name: name.child(it),
        };
      }),
      fields: Map(fields),
    }
  });

  return type;
}

function createEnumType(parent: Symbol, declarations: Map<Symbol, AccessRecord>, baseName: string, typeParams: string[], variants: {
  [key: string]: EnumTypeVariant
}): NominalType {
  const name = parent.child(baseName);

  const type: NominalType = {
    pos,
    kind: 'nominal',
    name,
  };

  declarations.set(name, {
    access: 'public',
    module: parent,
    type: {
      pos,
      kind: 'enum',
      name,
      typeParams: typeParams.map(it => {
        return {
          pos,
          kind: 'typeParameter',
          name: name.child(it),
        };
      }),
      variants: Map(variants),
    }
  });

  return type;
}

function unphasedFunction(args: TypeExpression[], result: TypeExpression, phase: FunctionPhase = 'fun'): FunctionType {
  return {
    pos,
    kind: 'function',
    phase,
    typeParams: [],
    params: args.map(type => {
      return {
        pos,
        phase: undefined,
        type,
      };
    }),
    result,
  }
}
