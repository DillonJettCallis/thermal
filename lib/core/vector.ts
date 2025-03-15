const factor = 32;

export class Vec<Item> {
  readonly size: number;
  readonly scale: number;
  readonly content: Array<any>;

  constructor(content: Array<any>, size: number, scale: number) {
    this.size = size;
    this.scale = scale;
    this.content = content;
  }
}

export function empty(): Vec<never> {
  return new Vec([], 0, 0);
}

export function from<Item>(src: Iterable<Item>): Vec<Item> {
  if (src instanceof Array && src.length <= factor) {
    return new Vec(src, src.length, 0);
  }

  let content = new Array<any>();
  let scale = 0;
  let size = 0;
  let pageSize = factor;

  for (const item of src) {
    size++;

    // if we are at capacity, we need to grow
    if (size > pageSize) {
      const newRoot = [content];
      scale++;
      pageSize = Math.pow(factor, scale + 1);
      pushMutable(newRoot, scale, size, item);
    } else {
      // we can fit into the current scale
      pushMutable(content, scale, size, item);
    }
  }

  return new Vec(content, size, scale);
}

function pushMutable<Item>(content: Array<any>, scale: number, index: number, item: Item): void {
  if (scale === 0) {
    // we are at the root
    content.push(item);
  } else {
    const pageSize = Math.pow(factor, scale);
    const pageIndex = Math.floor(index / pageSize);
    if (content.length === pageIndex) {
      // we need to create a new page
      const newChild: Array<any> = [];
      content.push(newChild);
      pushMutable(newChild, scale - 1, 0, item);
    } else {
      // page already exists, copy it and recurse
      const page = content[pageIndex] as Array<any>;
      pushMutable(page, scale - 1, index % pageSize, item);
    }
  }
}

function invalidIndex<Item>(self: Vec<Item>, index: number): boolean {
  return index >= self.size || index < 0 || !Number.isSafeInteger(index);
}

export function first<Item>(self: Vec<Item>): Item | undefined {
  if (self.size === 0) {
    return undefined;
  } else {
    return get(self, 0);
  }
}

export function last<Item>(self: Vec<Item>): Item | undefined {
  if (self.size === 0) {
    return undefined;
  } else {
    return get(self, self.size - 1);
  }
}

export function get<Item>(self: Vec<Item>, index: number): Item | undefined {
  if (invalidIndex(self, index)) {
    return undefined;
  }

  let content = self.content;
  let scale = self.scale;

  while (scale > 0) {
    const pageSize = Math.pow(factor, scale);
    const pageIndex = Math.floor(index / pageSize);
    content = content[pageIndex];
    scale--;
    index = index % pageSize;
  }

  // we are at the root
  return content[index] as Item;
}

export function push<Item>(self: Vec<Item>, item: Item): Vec<Item> {
  const pageSize = Math.pow(factor, self.scale + 1);

  // if we are at capacity, we need to grow
  if (pageSize === self.size) {
    const newRoot = [self.content];
    pushInternal(newRoot, self.scale + 1, self.size, item);
    return new Vec(newRoot, self.size + 1, self.scale + 1);
  } else {
    // we can fit into the current scale
    const contentCopy = self.content.slice();
    pushInternal(contentCopy, self.scale, self.size, item);
    return new Vec(contentCopy, self.size + 1, self.scale);
  }
}

function pushInternal<Item>(content: Array<any>, scale: number, index: number, item: Item): void {
  if (scale === 0) {
    // we are at the root
    content.push(item);
  } else {
    const pageSize = Math.pow(factor, scale);
    const pageIndex = Math.floor(index / pageSize);
    if (content.length === pageIndex) {
      // we need to create a new page
      const newChild: Array<any> = [];
      content.push(newChild);
      pushInternal(newChild, scale - 1, 0, item);
    } else {
      // page already exists, copy it and recurse
      const pageCopy = (content[pageIndex] as Array<any>).slice();
      content[pageIndex] = pageCopy;
      pushInternal(pageCopy, scale - 1, index % pageSize, item);
    }
  }
}

export function pop<Item>(self: Vec<Item>): Vec<Item> {
  if (self.size === 0) {
    throw new Error(`Index out of bounds. Cannot pop an empty list`);
  }

  const pageSize = Math.pow(factor, self.scale);

// if we are just one level above capacity, we can drop the last item and continue
  if (pageSize === self.size + 1) {
    const newRoot = self.content.slice();
    newRoot.pop();
    return new Vec(newRoot, self.size - 1, self.scale - 1);
  } else {
    // after removing the last item we'll have the same scale as we do now
    const contentCopy = self.content.slice();
    popInternal(contentCopy, self.scale, self.size);
    return new Vec(contentCopy, self.size - 1, self.scale);
  }
}

function popInternal(content: Array<any>, scale: number, size: number): void {
  if (scale === 0) {
    // we are at the root
    content.pop();
  } else {
    const pageSize = Math.pow(factor, scale);
    if (pageSize === size + 1) {
      // we have one item too many and can drop off the last item
      content.pop();
    } else {
      // we must remove from deeper down
      const pageIndex = content.length - 1;
      const pageCopy = (content[pageIndex] as Array<any>).slice();
      content[pageIndex] = pageCopy;
      popInternal(pageCopy, scale - 1, size % pageSize);
    }
  }
}

export function set<Item>(self: Vec<Item>, index: number, item: Item): Vec<Item> {
  if (invalidIndex(self, index)) {
    if (index === self.size) {
      // allow setting to the end of the list, but that's it
      return push(self, item);
    }

    throw new Error(`Index out of bounds. Cannot set index ${index} in a list with only ${self.size} elements`);
  }

  const contentCopy = self.content.slice();
  setInternal(contentCopy, self.scale, self.size, item);
  return new Vec(contentCopy, self.size, self.scale);
}

function setInternal<Item>(content: Array<any>, scale: number, index: number, item: Item): void {
  if (scale === 0) {
    // we are at the root
    content[index] = item;
  } else {
    const pageSize = Math.pow(factor, scale);
    const pageIndex = Math.floor(index / pageSize);
    const pageCopy = (content[pageIndex] as Array<any>).slice();
    content[pageIndex] = pageCopy;
    setInternal(pageCopy, scale - 1, index % pageSize, item);
  }
}

export function concat<Item>(self: Vec<Item>, other: Iterable<Item>): Vec<Item> {
  if (self.size === 0) {
    if (other instanceof Vec) {
      return other;
    } else {
      return from(other);
    }
  }

  let sum: Vec<Item> = self;

  for (const next of other) {
    sum = push(sum, next);
  }

  return sum;
}

function iterator<Item>(self: Vec<Item>): IterableIterator<Item> {
  return internalIterator(self.content, self.scale);
}

function* internalIterator<Item>(content: Array<any>, scale: number): IterableIterator<Item> {
  if (scale === 0) {
    return yield* (content as Array<Item>);
  } else {
    for (const page of content) {
      yield* internalIterator(page as Array<any>, scale);
    }
  }
}

export function map<Item, Out>(self: Vec<Item>, mapper: (item: Item) => Out): Vec<Out> {
  return from(mapInternal(self, mapper));
}

function* mapInternal<Item, Out>(self: Vec<Item>, mapper: (item: Item) => Out): IterableIterator<Out> {
  for (const next of iterator(self)) {
    yield mapper(next);
  }
}

export function flatMap<Item, Out>(self: Vec<Item>, mapper: (item: Item) => Iterable<Out>): Vec<Out> {
  return from(flatMapInternal(self, mapper));
}

function* flatMapInternal<Item, Out>(self: Vec<Item>, mapper: (item: Item) => Iterable<Out>): IterableIterator<Out> {
  for (const next of iterator(self)) {
    yield* mapper(next);
  }
}

export function filter<Item>(self: Vec<Item>, test: (item: Item) => boolean): Vec<Item> {
  return from(filterInternal(self, test));
}

function* filterInternal<Item>(self: Vec<Item>, test: (item: Item) => boolean): IterableIterator<Item> {
  for (const next of iterator(self)) {
    if (test(next)) {
      yield next;
    }
  }
}

export function forEach<Item>(self: Vec<Item>, action: (item: Item) => void): void {
  for (const next of iterator(self)) {
    action(next);
  }
}

export function fold<Item, Out>(self: Vec<Item>, init: Out, mapper: (sum: Out, next: Item) => Out): Out {
  for (const next of iterator(self)) {
    init = mapper(init, next);
  }

  return init;
}
