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
  } else if (type === List) {
    return obj instanceof List;
  } else if (type === HashMap) { // TODO: these checks all need to be improved
    return obj instanceof HashMap;
  } else if (type === HashSet) {
    return obj instanceof HashSet;
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

export class List<Item> implements Iterable<Item> {
  static readonly #factor = 32; // this many items per layer of array
  readonly #size: number;
  readonly #scale: number;
  readonly #content: Array<any>;

  constructor(content: Array<any>, size: number, scale: number) {
    this.#content = content;
    this.#size = size;
    this.#scale = scale;
  }

  static readonly EMPTY = new List<never>([], 0, 0);

  static of<Item>(src: Iterable<Item>): List<Item> {
    if (src instanceof Array && src.length <= this.#factor) {
      return new List(src, src.length, 0);
    }

    let content = new Array<any>();
    let scale = 0;
    let size = 0;
    let pageSize = this.#factor;

    for (const item of src) {
      size++;

      // if we are at capacity, we need to grow
      if (size > pageSize) {
        const newRoot = [content];
        scale++;
        pageSize = Math.pow(this.#factor, scale + 1);
        this.#pushMutable(newRoot, scale, size, item);
      } else {
        // we can fit into the current scale
        this.#pushMutable(content, scale, size, item);
      }
    }

    return new List(content, size, scale);
  }

  static #pushMutable<Item>(content: Array<any>, scale: number, index: number, item: Item): void {
    if (scale === 0) {
      // we are at the root
      content.push(item);
    } else {
      const pageSize = Math.pow(List.#factor, scale);
      const pageIndex = Math.floor(index / pageSize);
      if (content.length === pageIndex) {
        // we need to create a new page
        const newChild: Array<any> = [];
        content.push(newChild);
        this.#pushMutable(newChild, scale - 1, 0, item);
      } else {
        // page already exists, copy it and recurse
        const page = content[pageIndex] as Array<any>;
        this.#pushMutable(page, scale - 1, index % pageSize, item);
      }
    }
  }

  get size(): number {
    return this.#size;
  }

  #invalidIndex(index: number): boolean {
    return index >= this.#size || index < 0 || !Number.isSafeInteger(index);
  }

  first(): Item | undefined {
    if (this.#size === 0) {
      return undefined;
    } else {
      return this.get(0);
    }
  }

  last(): Item | undefined {
    if (this.#size === 0) {
      return undefined;
    } else {
      return this.get(this.#size - 1);
    }
  }

  get(index: number): Item | undefined {
    if (this.#invalidIndex(index)) {
      return undefined;
    }

    let content = this.#content;
    let scale = this.#scale;

    while (scale > 0) {
      const pageSize = Math.pow(List.#factor, scale);
      const pageIndex = Math.floor(index / pageSize);
      content = content[pageIndex];
      scale--;
      index = index % pageSize;
    }

    // we are at the root
    return content[index] as Item;
  }

  push(item: Item): List<Item> {
    const pageSize = Math.pow(List.#factor, this.#scale + 1);

    // if we are at capacity, we need to grow
    if (pageSize === this.#size) {
      const newRoot = [this.#content];
      List.#pushInternal(newRoot, this.#scale + 1, this.#size, item);
      return new List(newRoot, this.#size + 1, this.#scale + 1);
    } else {
      // we can fit into the current scale
      const contentCopy = this.#content.slice();
      List.#pushInternal(contentCopy, this.#scale, this.#size, item);
      return new List(contentCopy, this.#size + 1, this.#scale);
    }
  }

  static #pushInternal<Item>(content: Array<any>, scale: number, index: number, item: Item): void {
    if (scale === 0) {
      // we are at the root
      content.push(item);
    } else {
      const pageSize = Math.pow(List.#factor, scale);
      const pageIndex = Math.floor(index / pageSize);
      if (content.length === pageIndex) {
        // we need to create a new page
        const newChild: Array<any> = [];
        content.push(newChild);
        this.#pushInternal(newChild, scale - 1, 0, item);
      } else {
        // page already exists, copy it and recurse
        const pageCopy = (content[pageIndex] as Array<any>).slice();
        content[pageIndex] = pageCopy;
        this.#pushInternal(pageCopy, scale - 1, index % pageSize, item);
      }
    }
  }

  pop(): List<Item> {
    if (this.#size === 0) {
      throw new Error(`Index out of bounds. Cannot pop an empty list`);
    }

    const pageSize = Math.pow(List.#factor, this.#scale);

    // if we are just one level above capacity, we can drop the last item and continue
    if (pageSize === this.#size + 1) {
      const newRoot = this.#content.slice();
      newRoot.pop();
      return new List(newRoot, this.#size - 1, this.#scale - 1);
    } else {
      // after removing the last item we'll have the same scale as we do now
      const contentCopy = this.#content.slice();
      List.#popInternal(contentCopy, this.#scale, this.#size);
      return new List(contentCopy, this.#size - 1, this.#scale);
    }
  }

  static #popInternal(content: Array<any>, scale: number, size: number): void {
    if (scale === 0) {
      // we are at the root
      content.pop();
    } else {
      const pageSize = Math.pow(List.#factor, scale);
      if (pageSize === size + 1) {
        // we have one item too many and can drop off the last item
        content.pop();
      } else {
        // we must remove from deeper down
        const pageIndex = content.length - 1;
        const pageCopy = (content[pageIndex] as Array<any>).slice();
        content[pageIndex] = pageCopy;
        this.#popInternal(pageCopy, scale - 1, size % pageSize);
      }
    }
  }

  set(index: number, item: Item): List<Item> {
    if (this.#invalidIndex(index)) {
      if (index === this.#size) {
        // allow setting to the end of the list, but that's it
        return this.push(item);
      }

      throw new Error(`Index out of bounds. Cannot set index ${index} in a list with only ${this.#size} elements`);
    }

    const contentCopy = this.#content.slice();
    List.#setInternal(contentCopy, this.#scale, this.#size, item);
    return new List(contentCopy, this.#size, this.#scale);
  }

  static #setInternal<Item>(content: Array<any>, scale: number, index: number, item: Item): void {
    if (scale === 0) {
      // we are at the root
      content[index] = item;
    } else {
      const pageSize = Math.pow(List.#factor, scale);
      const pageIndex = Math.floor(index / pageSize);
      const pageCopy = (content[pageIndex] as Array<any>).slice();
      content[pageIndex] = pageCopy;
      this.#setInternal(pageCopy, scale - 1, index % pageSize, item);
    }
  }

  static concat<Item>(left: List<Item>, right: List<Item>): List<Item> {
    return left.concat(right);
  }

  concat(other: Iterable<Item>): List<Item> {
    if (this.#size === 0) {
      if (other instanceof List) {
        return other;
      } else {
        return List.of(other);
      }
    }

    let sum: List<Item> = this;

    for (const next of other) {
      sum = sum.push(next);
    }

    return sum;
  }

  [Symbol.iterator](): IterableIterator<Item> {
    return this.#internalIterator(this.#content, this.#scale);
  }

  *#internalIterator(content: Array<any>, scale: number): IterableIterator<Item> {
    if (scale === 0) {
      return yield* (content as Array<Item>);
    } else {
      for (const page of content) {
        yield* this.#internalIterator(page as Array<any>, scale);
      }
    }
  }

  map<Out>(mapper: (item: Item) => Out): List<Out> {
    return List.of(this.#mapInternal(mapper));
  }

  *#mapInternal<Out>(mapper: (item: Item) => Out): IterableIterator<Out> {
    for (const next of this) {
      yield mapper(next);
    }
  }

  flatMap<Out>(mapper: (item: Item) => Iterable<Out>): List<Out> {
    return List.of(this.#flatMapInternal(mapper));
  }

  *#flatMapInternal<Out>(mapper: (item: Item) => Iterable<Out>): IterableIterator<Out> {
    for (const next of this) {
      yield* mapper(next);
    }
  }

  filter(test: (item: Item) => boolean): List<Item> {
    return List.of(this.#filterInternal(test));
  }

  *#filterInternal(test: (item: Item) => boolean): IterableIterator<Item> {
    for (const next of this) {
      if (test(next)) {
        yield next;
      }
    }
  }

  forEach(action: (item: Item) => void): void {
    for (const next of this) {
      action(next);
    }
  }

  static fold<Item, Out>(list: List<Item>, init: Out, mapper: (sum: Out, next: Item) => Out): Out {
    return list.fold(init, mapper);
  }

  fold<Out>(init: Out, mapper: (sum: Out, next: Item) => Out): Out {
    for (const next of this) {
      init = mapper(init, next);
    }

    return init;
  }
}

type Entry<Key, Value> = { hash: number, key: Key, value: Value };
type Bucket<Key, Value> = undefined | Entry<Key, Value> | Array<Entry<Key, Value>>;

// TODO: replace this with an in-language implementation that uses protocol based equals and hashcode
export class HashMap<Key, Value> implements Iterable<readonly [Key, Value]> {
  readonly #buckets: Array<Bucket<Key, Value>>;
  readonly #size: number;

  constructor(buckets: Array<Bucket<Key, Value>>, size: number) {
    this.#buckets = buckets;
    this.#size = size;
  }

  static readonly EMPTY = new HashMap<never, never>(new Array(3), 0);

  static of<Key, Value>(pairs: Iterable<readonly [Key, Value]>): HashMap<Key, Value> {
    let bucketsCopy = new Array<Bucket<Key, Value>>(3);
    let size = 0;

    for (const [key, value] of pairs) {
      const hash = hashCode(key);
      const newEntry = { hash, key, value };
      const bucketIndex = hash % bucketsCopy.length;

      const bucket = bucketsCopy[bucketIndex];

      if (bucket === undefined) {
        // item not found, replace no bucket with bucket of one
        bucketsCopy[bucketIndex] = newEntry;
        size++;
      } else if (bucket instanceof Array) {
        const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

        if (entryIndex === -1) {
          // item not found, add new entry to this bucket
          if (size + 1 > bucketsCopy.length / 4) {
            // if there are an average of more than 4 items per bucket, increase the number of buckets
            const oldBuckets = bucketsCopy;
            bucketsCopy = new Array(bucketsCopy.length * 2);

            for (const bucket of oldBuckets) {
              if (bucket === undefined) {
                // do nothing
              } else if (bucket instanceof Array) {
                for (const entry of bucket) {
                  const index = entry.hash % bucketsCopy.length;
                  const existing = bucketsCopy[index];

                  if (existing === undefined) {
                    bucketsCopy[index] = entry;
                  } else if (existing instanceof Array) {
                    existing.push(entry);
                  } else {
                    bucketsCopy[index] = [existing, entry];
                  }
                }
              } else {
                const index = bucket.hash % bucketsCopy.length;
                const existing = bucketsCopy[index];

                if (existing === undefined) {
                  bucketsCopy[index] = bucket;
                } else if (existing instanceof Array) {
                  existing.push(bucket);
                } else {
                  bucketsCopy[index] = [existing, bucket];
                }
              }
            }

            size++;
          } else {
            // fit within the same number of buckets
            const bucketCopy = bucket.slice();
            bucketCopy.push(newEntry);
            bucketsCopy[bucketIndex] = bucketCopy;

            size++;
          }
        } else {
          // item found, replace it in this bucket
          const bucketCopy = bucket.slice();
          bucketCopy[entryIndex] = newEntry;
          bucketsCopy[bucketIndex] = bucketCopy;
        }
      } else {
        if (bucket.hash === hash && equals(bucket.key, key)) {
          // item found, replace it in place
          bucketsCopy[bucketIndex] = newEntry;
        } else {
          // item not found, turn this single item into an array of two items
          bucketsCopy[bucketIndex] = [bucket, newEntry];

          size++;
        }
      }
    }

    return new HashMap(bucketsCopy, size);
  }

  get size(): number {
    return this.#size;
  }

  has(key: Key): boolean {
    const hash = hashCode(key);

    const bucket = this.#buckets[hash % this.#buckets.length];

    if (bucket === undefined) {
      return false;
    } else if (bucket instanceof Array) {
      const entry = bucket.find(entry => entry.hash === hash && equals(entry.key, key));

      return entry !== undefined;
    } else {
      return bucket.hash === hash && equals(bucket.key, key);
    }
  }

  get(key: Key): Value | undefined {
    const hash = hashCode(key);

    const bucket = this.#buckets[hash % this.#buckets.length];

    if (bucket === undefined) {
      return undefined;
    } else if (bucket instanceof Array) {
      const entry = bucket.find(entry => entry.hash === hash && equals(entry.key, key));

      if (entry === undefined) {
        return undefined;
      } else {
        return entry.value;
      }
    } else {
      if (bucket.hash === hash && equals(bucket.key, key)) {
        return bucket.value;
      } else {
        return undefined;
      }
    }
  }

  static set<Key, Value>(self: HashMap<Key, Value>, key: Key, value: Value): HashMap<Key, Value> {
    return self.set(key, value);
  }

  set(key: Key, value: Value): HashMap<Key, Value> {
    const hash = hashCode(key);
    const newEntry: Entry<Key, Value> = { hash, key, value };
    const bucketIndex = hash % this.#buckets.length;

    const bucket = this.#buckets[bucketIndex];

    if (bucket === undefined) {
      // item not found, replace no bucket with bucket of one
      const bucketsCopy = this.#buckets.slice();
      bucketsCopy[bucketIndex] = newEntry;

      return new HashMap(bucketsCopy, this.#size + 1);
    } else if (bucket instanceof Array) {
      const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

      if (entryIndex === -1) {
        // item not found, add new entry to this bucket
        if (this.#size + 1 > this.#buckets.length / 4) {
          // if there are an average of more than 4 items per bucket, increase the number of buckets
          const newBuckets = new Array(this.#buckets.length * 2);

          for (const bucket of this.#buckets) {
            if (bucket === undefined) {
              // do nothing
            } else if (bucket instanceof Array) {
              for (const entry of bucket) {
                const index = entry.hash % newBuckets.length;
                const existing = newBuckets[index];

                if (existing === undefined) {
                  newBuckets[index] = entry;
                } else if (existing instanceof Array) {
                  existing.push(entry);
                } else {
                  newBuckets[index] = [existing, entry];
                }
              }
            } else {
              const index = bucket.hash % newBuckets.length;
              const existing = newBuckets[index];

              if (existing === undefined) {
                newBuckets[index] = bucket;
              } else if (existing instanceof Array) {
                existing.push(bucket);
              } else {
                newBuckets[index] = [existing, bucket];
              }
            }
          }

          // add the new item too
          const index = hash % newBuckets.length;
          const existing = newBuckets[index];

          if (existing === undefined) {
            newBuckets[index] = newEntry;
          } else if (existing instanceof Array) {
            existing.push(newEntry);
          } else {
            newBuckets[index] = [existing, newEntry];
          }

          return new HashMap(newBuckets, this.#size + 1);
        } else {
          // fit within the same number of buckets
          const bucketsCopy = this.#buckets.slice();
          const bucketCopy = bucket.slice();
          bucketCopy.push(newEntry);
          bucketsCopy[bucketIndex] = bucketCopy;

          return new HashMap(bucketsCopy, this.#size + 1);
        }
      } else {
        // item found, replace it in this bucket
        const bucketsCopy = this.#buckets.slice();
        const bucketCopy = bucket.slice();
        bucketCopy[entryIndex] = newEntry;
        bucketsCopy[bucketIndex] = bucketCopy;

        return new HashMap(bucketsCopy, this.#size);
      }
    } else {
      if (bucket.hash === hash && equals(bucket.key, key)) {
        // item found, replace it in place

        const bucketsCopy = this.#buckets.slice();
        bucketsCopy[bucketIndex] = newEntry;

        return new HashMap(bucketsCopy, this.#size);
      } else {
        // item not found, turn this single item into an array of two items
        const bucketsCopy = this.#buckets.slice();
        bucketsCopy[bucketIndex] = [bucket, newEntry];

        return new HashMap(bucketsCopy, this.#size + 1);
      }
    }
  }

  static update<Key, Value>(self: HashMap<Key, Value>, key: Key, updater: (old: Value | undefined) => Value | undefined): HashMap<Key, Value> {
    return self.update(key, updater);
  }

  update(key: Key, updater: (old: Value | undefined) => Value | undefined): HashMap<Key, Value> {
    const hash = hashCode(key);
    const bucketIndex = hash % this.#buckets.length;

    const bucket = this.#buckets[bucketIndex];

    if (bucket === undefined) {
      // item not found, replace no bucket with bucket of one
      const bucketsCopy = this.#buckets.slice();
      const value = updater(undefined);

      if (value === undefined) {
        // make no changes
        return this;
      }

      // set this item into the bucket and leave
      bucketsCopy[bucketIndex] = { hash, key, value };

      return new HashMap(bucketsCopy, this.#size + 1);
    } else if (bucket instanceof Array) {
      const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

      if (entryIndex === -1) {
        // item not found, add new entry to this bucket
        const value = updater(undefined);

        if (value === undefined) {
          // make no changes
          return this;
        }

        const newEntry = { hash, key, value };

        if (this.#size + 1 > this.#buckets.length / 4) {
          // if there are an average of more than 4 items per bucket, increase the number of buckets
          const newBuckets = new Array(this.#buckets.length * 2);

          for (const bucket of this.#buckets) {
            if (bucket === undefined) {
              // do nothing
            } else if (bucket instanceof Array) {
              for (const entry of bucket) {
                const index = entry.hash % newBuckets.length;
                const existing = newBuckets[index];

                if (existing === undefined) {
                  newBuckets[index] = entry;
                } else if (existing instanceof Array) {
                  existing.push(entry);
                } else {
                  newBuckets[index] = [existing, entry];
                }
              }
            } else {
              const index = bucket.hash % newBuckets.length;
              const existing = newBuckets[index];

              if (existing === undefined) {
                newBuckets[index] = bucket;
              } else if (existing instanceof Array) {
                existing.push(bucket);
              } else {
                newBuckets[index] = [existing, bucket];
              }
            }
          }

          // add the new item too
          const index = hash % newBuckets.length;
          const existing = newBuckets[index];

          if (existing === undefined) {
            newBuckets[index] = newEntry;
          } else if (existing instanceof Array) {
            existing.push(newEntry);
          } else {
            newBuckets[index] = [existing, newEntry];
          }

          return new HashMap(newBuckets, this.#size + 1);
        } else {
          // fit within the same number of buckets
          const bucketsCopy = this.#buckets.slice();
          const bucketCopy = bucket.slice();
          bucketCopy.push(newEntry);
          bucketsCopy[bucketIndex] = bucketCopy;

          return new HashMap(bucketsCopy, this.#size + 1);
        }
      } else {
        // item found, check it

        // start by preparing the new buckets
        const bucketsCopy = this.#buckets.slice();
        const bucketCopy = bucket.slice();
        bucketsCopy[bucketIndex] = bucketCopy;

        const value = updater(bucket[entryIndex]!.value);

        if (value === undefined) {
          // remove the item from the bucket
          if (bucketCopy.length === 2) {
            bucketsCopy[bucketIndex] = bucketCopy[entryIndex === 0 ? 1 : 0];
          } else {
            bucketCopy.splice(entryIndex, 1);
          }
        } else {
          // fit the new value into the bucket copy
          bucketCopy[entryIndex] = { hash, key, value };
        }

        return new HashMap(bucketsCopy, this.#size);
      }
    } else {
      if (bucket.hash === hash && equals(bucket.key, key)) {
        // item found, replace it in place
        const bucketsCopy = this.#buckets.slice();
        const value = updater(bucket.value);

        if (value === undefined) {
          // remove the item
          bucketsCopy[bucketIndex] = undefined;
        } else {
          bucketsCopy[bucketIndex] = { hash, key, value };
        }

        return new HashMap(bucketsCopy, this.#size);
      } else {
        // item not found, turn this single item into an array of two items
        const value = updater(undefined);

        if (value === undefined) {
          // make no change
          return this;
        }

        const bucketsCopy = this.#buckets.slice();
        bucketsCopy[bucketIndex] = [bucket, { hash, key, value }];

        return new HashMap(bucketsCopy, this.#size + 1);
      }
    }
  }

  remove(key: Key): HashMap<Key, Value> {
    const hash = hashCode(key);
    const bucketIndex = hash % this.#buckets.length;

    const bucket = this.#buckets[bucketIndex];

    if (bucket === undefined) {
      // not found, change nothing

      return this;
    } else if (bucket instanceof Array) {
      const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

      if (entryIndex === -1) {
        // not found, change nothing
        return this;
      } else {
        // found at index, remove from array
        const newBuckets = this.#buckets.slice();

        if (bucket.length === 2) {
          // turn array into a single item
          newBuckets[bucketIndex] = bucket[entryIndex === 1 ? 0 : 1]!;
        } else {
          const newBucket = bucket.slice();
          newBucket.splice(entryIndex, 1);
          newBuckets[bucketIndex] = newBucket;
        }

        return new HashMap<Key, Value>(newBuckets, this.#size - 1);
      }
    } else {
      if (bucket.hash === hash && equals(bucket.key, key)) {
        // found at bucket, replace with empty

        if (this.#size === 1) {
          // we are removing the only item, just return the EMPTY starter map
          return HashMap.EMPTY;
        } else {
          const newBuckets = this.#buckets.slice();
          newBuckets[bucketIndex] = undefined;
          return new HashMap<Key, Value>(newBuckets, this.#size - 1);
        }
      } else {
        // not found, do nothing
        return this;
      }
    }
  }

  *keys(): IterableIterator<Key> {
    for (const bucket of this.#buckets) {
      if (bucket instanceof Array) {
        for (const {key} of bucket) {
          yield key;
        }
      } else if (bucket !== undefined) {
        yield bucket.key;
      }
    }
  }

  *[Symbol.iterator](): IterableIterator<readonly [Key, Value]> {
    for (const bucket of this.#buckets) {
      if (bucket instanceof Array) {
        for (const {key, value} of bucket) {
          yield [key, value];
        }
      } else if (bucket !== undefined) {
        yield [bucket.key, bucket.value];
      }
    }
  }

  forEach(action: (value: Value, key: Key) => void): void {
    for (const [key, value] of this) {
      action(value, key);
    }
  }

  static *#entriesOf<Key, Value>(buckets: Array<Bucket<Key, Value>>): IterableIterator<Entry<Key, Value>> {
    for (const bucket of buckets) {
      if (bucket instanceof Array) {
        yield* bucket;
      } else if (bucket !== undefined) {
        yield bucket;
      }
    }
  }

  merge(other: HashMap<Key, Value>): HashMap<Key, Value> {
    if (other.size === 0) {
      return this;
    } else if (this.#size === 0) {
      return other;
    } else {
      // copy the outer array only once (unless we need to resize), copy children as needed
      let bucketsCopy = this.#buckets.slice();
      let size = this.#size;

      for (const newEntry of HashMap.#entriesOf(other.#buckets)) {
        const { hash, key } = newEntry;
        const bucketIndex = hash % bucketsCopy.length;

        const bucket = bucketsCopy[bucketIndex];

        if (bucket === undefined) {
          // item not found, replace no bucket with bucket of one
          bucketsCopy[bucketIndex] = newEntry;
          size++;
        } else if (bucket instanceof Array) {
          const entryIndex = bucket.findIndex(entry => entry.hash === hash && equals(entry.key, key));

          if (entryIndex === -1) {
            // item not found, add new entry to this bucket
            if (size + 1 > bucketsCopy.length / 4) {
              // if there are an average of more than 4 items per bucket, increase the number of buckets
              const oldBuckets = bucketsCopy;
              bucketsCopy = new Array(bucketsCopy.length * 2);

              for (const bucket of oldBuckets) {
                if (bucket === undefined) {
                  // do nothing
                } else if (bucket instanceof Array) {
                  for (const entry of bucket) {
                    const index = entry.hash % bucketsCopy.length;
                    const existing = bucketsCopy[index];

                    if (existing === undefined) {
                      bucketsCopy[index] = entry;
                    } else if (existing instanceof Array) {
                      existing.push(entry);
                    } else {
                      bucketsCopy[index] = [existing, entry];
                    }
                  }
                } else {
                  const index = bucket.hash % bucketsCopy.length;
                  const existing = bucketsCopy[index];

                  if (existing === undefined) {
                    bucketsCopy[index] = bucket;
                  } else if (existing instanceof Array) {
                    existing.push(bucket);
                  } else {
                    bucketsCopy[index] = [existing, bucket];
                  }
                }
              }

              size++;
            } else {
              // fit within the same number of buckets
              const bucketCopy = bucket.slice();
              bucketCopy.push(newEntry);
              bucketsCopy[bucketIndex] = bucketCopy;

              size++;
            }
          } else {
            // item found, replace it in this bucket
            const bucketCopy = bucket.slice();
            bucketCopy[entryIndex] = newEntry;
            bucketsCopy[bucketIndex] = bucketCopy;
          }
        } else {
          if (bucket.hash === hash && equals(bucket.key, key)) {
            // item found, replace it in place
            bucketsCopy[bucketIndex] = newEntry;
          } else {
            // item not found, turn this single item into an array of two items
            bucketsCopy[bucketIndex] = [bucket, newEntry];

            size++;
          }
        }
      }

      return new HashMap(bucketsCopy, size);
    }
  }
}

export class HashSet<Item> {
  readonly #map: HashMap<Item, boolean>;

  constructor(map: HashMap<Item, boolean>) {
    this.#map = map;
  }

  static readonly EMPTY = new HashSet(HashMap.EMPTY);

  static of<Key>(items: Iterable<Key>): HashSet<Key> {
    return new HashSet(HashMap.of(HashSet.#mapKeyToEntryPair(items)));
  }

  static *#mapKeyToEntryPair<Key>(items: Iterable<Key>): IterableIterator<readonly [Key, true]> {
    for (const item of items) {
      yield [item, true] as const;
    }
  }

  add(item: Item): HashSet<Item> {
    return new HashSet(this.#map.set(item, true));
  }

  remove(item: Item): HashSet<Item> {
    return new HashSet(this.#map.remove(item));
  }

  has(item: Item): boolean {
    return this.#map.has(item);
  }

  merge(other: HashSet<Item>): HashSet<Item> {
    return new HashSet(this.#map.merge(other.#map));
  }

}
