import { type HashMap, from as hashMapFrom, emptyMap as emptyHashMap, set as mapSet, remove as mapRemove, has as mapHas, merge as mapMerge } from './map.js';

export class HashSet<Item> {
  readonly map_: HashMap<Item, boolean>;

  constructor(map: HashMap<Item, boolean>) {
    this.map_ = map;
  }

  get size(): number {
    return this.map_.size_;
  }
}

export function empty(): HashSet<never> {
  return new HashSet<never>(emptyHashMap);
}

export function from<Item>(source: Iterable<Item>): HashSet<Item> {
  return new HashSet<Item>(hashMapFrom(mapKeyToEntryPair(source)));
}

function* mapKeyToEntryPair<Key>(items: Iterable<Key>): IterableIterator<readonly [Key, true]> {
  for (const item of items) {
    yield [item, true] as const;
  }
}

export function add<Item>(self: HashSet<Item>, item: Item): HashSet<Item> {
  return new HashSet(mapSet(self.map_, item, true));
}

export function remove<Item>(self: HashSet<Item>, item: Item): HashSet<Item> {
  return new HashSet(mapRemove(self.map_, item));
}

export function has<Item>(self: HashSet<Item>, item: Item): boolean {
  return mapHas(self.map_, item);
}

export function merge<Item>(self: HashSet<Item>, other: HashSet<Item>): HashSet<Item> {
  return new HashSet(mapMerge(self.map_, other.map_));
}
