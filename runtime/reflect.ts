export const thermalClass = Symbol('Thermal class');
export const thermalClassMarker = Symbol('Thermal Class Marker');

export interface ThermalObject {
  [thermalClass]: ThermalClass;
  [key: string]: any;
}

export interface ThermalClass {
  [thermalClassMarker]: true;

  fullName: string; // TODO: for now just include version and everything here
  name: string; // just the final name
  // TODO: more room for bounds here
  generics: Array<{ name: string, bound: ThermalClass | undefined }>;
  type: 'enum' | 'struct' | 'tuple' | 'atom';

  // undefined if not a member of an enum, otherwise it's the enum
  enum: ThermalClass | undefined;

  // if an enum these are the variants, if a struct these are the fields, if a tuple these are the fields as _0, _1 etc and if an atom this is empty
  fields: { [key: string]: ThermalClass; };

  // TODO: methods, protocols
}

function isThermalObject(obj: any): obj is ThermalObject {
  return obj != null && typeof obj === 'object' && thermalClass in obj;
}

function isThermalClass(obj: any): obj is ThermalClass {
  return obj != null && typeof obj === 'object' && thermalClassMarker in obj;
}

export function stringConcat(left: string, right: string): string {
  return left + right;
}

export function is(obj: any, type: any): boolean {
  if (obj == null) {
    return false;
  }

  if (typeof obj === 'object' && isThermalClass(type) && thermalClass in obj) {
    const clazz = obj[thermalClass] as ThermalClass;

    // either object is of type, or type is an enum and obj is a variant of type
    return clazz === type || (type.type === 'enum' && clazz.enum === type);
  } else if (type === String) { // TODO: primitive checks need a better solution (how does Integer vs Float work? Can it work?)
    return typeof obj === 'string';
  } else if (type === Number) {
    return typeof obj === 'number';
  } else if (type === Boolean) {
    return typeof obj === 'boolean';
  } else {
    return false;
  }
}

// TODO: implement equality protocol
export function equals(left: any, right: any): boolean {
  if (left === right ) {
    return true;
  } else if (isThermalObject(left) && isThermalObject(right)) {
    const leftClass = left[thermalClass] as ThermalClass;
    const rightClass = right[thermalClass] as ThermalClass;

    if (leftClass.fullName !== rightClass.fullName) {
      return false; // not the same type, must be different
    }

    for (const field of Object.keys(leftClass.fields)) {
      if (!equals(left[field], right[field])) {
        return false;
      }
    }

    return true;
  } else if (left instanceof Array && right instanceof Array) {
    if (left.length !== right.length) {
      return false;
    }

    for (let i = left.length - 1; i >= 0; i--) {
      if (!equals(left[i], right[i])) {
        return false;
      }
    }

    return true;
  } else if (typeof left === 'number' && typeof right === 'number') {
    // NaN needs a special case to be equal
    return Number.isNaN(left) && Number.isNaN(right);
  } else if (typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = new Set(Object.keys(right));

    // if there aren't the same number of keys, they can't be equal
    if (leftKeys.length !== rightKeys.size) {
      return false;
    }

    // check each field, if any of them fail, they aren't equal
    for (const leftKey of leftKeys) {
      // right needs to both have the key and have an equal value, otherwise we fail
      if (!rightKeys.has(leftKey) || !equals(left[leftKey], right[leftKey])) {
        return false;
      }
    }

    return true;
  } else {
    return false;
  }
}

const enum HashCodeType {
  Null,
  Boolean,
  Number,
  BigInt,
  String,
  Symbol,
  Function,
  Object,
  Array,
}

function hashString(content: Array<number>, str: string): void {
  for (let i = str.length - 1; i >= 0; i--) {
    content.push(str.charCodeAt(i));
  }
}

function hash(content: Array<number>, obj: any): void {
  switch (typeof obj) {
    case 'undefined':
      content.push(HashCodeType.Null)
      return;
    case 'boolean':
      content.push(HashCodeType.Boolean, obj ? 1 : 0);
      return;
    case 'number':
      // || 0 turns -0 and NaN into 0 so we don't have to deal with them
      content.push(HashCodeType.Number, obj || 0);
      return;
    case 'bigint':
      content.push(HashCodeType.BigInt);
      hashString(content, obj.toString(10));
      return;
    case 'symbol':
      content.push(HashCodeType.Symbol);
      hashString(content, obj.toString());
      return;
    case 'string':
      content.push(HashCodeType.String);
      hashString(content, obj);
      return;
    case 'function':
      content.push(HashCodeType.Function);
      hash(content, obj.name);
      return;
    default:
      if (obj === null) {
        content.push(HashCodeType.Null);
        return;
      }

      if (Array.isArray(obj)) {
        content.push(HashCodeType.Array);
        for (const next of obj) {
          hash(content, next);
        }
        return;
      }

      content.push(HashCodeType.Object);

      if (thermalClass in obj) {
        const clazz = obj[thermalClass] as ThermalClass;

        hashString(content, clazz.fullName);
        for (const key of Object.keys(clazz.fields)) {
          hash(content, obj[key]);
        }
      } else {
        // sort by keys so that key order does not matter
        // good thing that > works on strings
        const entries = Object.entries(obj).sort(([left], [right]) => left > right ? 1 : -1);

        for (const [key, value] of entries) {
          hashString(content, key);
          hash(content, value);
        }
      }

      return;
  }
}

// TODO: implement hashable protocol
export function hashCode(obj: any): number {
  const content = new Array<number>();

  hash(content, obj);

  const view = new Uint32Array(new Float64Array(content).buffer);

  return view.reduce((sum, next) => Math.imul(sum, 31) + next | 0, 7);
}
