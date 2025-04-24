import { equals } from './reflect.js';

class SingletonImpl<Item> implements Flow<Item> {
  readonly #value: Item;
  constructor(value: Item) {
    this.#value = value;
  }

  get_(): Item {
    return this.#value;
  }

  debug_(): any {
    return {
      kind: 'singleton',
      value: this.#value,
    };
  }

  subscribe_(): void {
  }

  unsubscribe_() {
  }
}

class VarImpl<Item> implements Var<Item> {
  readonly #listeners: Array<Sink> = [];
  #value: Item;

  constructor(init: Item) {
    this.#value = init;
  }

  get_(): Item {
    return this.#value;
  }

  debug_(): any {
    return {
      kind: 'var',
      value: this.#value,
    };
  }

  set_(value: Item): void {
    // if no actual change is made, don't trigger a recalculate chain
    if (equals(this.#value, value)) {
      return;
    }

    this.#value = value;
    this.#listeners.forEach(it => it.markDirty_());
  }

  subscribe_(sink: Sink) {
    this.#listeners.push(sink);
  }

  unsubscribe_(sink: Sink) {
    const index = this.#listeners.indexOf(sink);
    if (index !== -1) {
      this.#listeners.splice(index, 1);
    }
  }
}

class ProjectionImpl<Base, Item> implements Var<Item>, Sink {
  readonly #root: Var<Base>;
  readonly #getter: (base: Base) => Item;
  readonly #setter: (base: Base, value: Item) => Base
  readonly #listeners: Array<Sink> = [];

  constructor(root: Var<Base>, getter: (base: Base) => Item, setter: (base: Base, value: Item) => Base) {
    this.#root = root;
    this.#getter = getter;
    this.#setter = setter;
    root.subscribe_(this);
  }

  get_(): Item {
    return this.#getter(this.#root.get_());
  }

  debug_(): any {
    return {
      kind: 'projection',
      root: this.#root,
      value: this.get_(),
    }
  }

  set_(value: Item): void {
    // updating root will always call markDirty on us, so we don't need to worry about doing that explicitly here
    this.#root.set_(this.#setter(this.#root.get_(), value));
  }

  markDirty_(): void {
    this.#listeners.forEach(it => it.markDirty_());
  }

  subscribe_(sink: Sink) {
    this.#listeners.push(sink);
  }

  unsubscribe_(sink: Sink) {
    const index = this.#listeners.indexOf(sink);
    if (index !== -1) {
      this.#listeners.splice(index, 1);
    }
  }
}

class FlowImpl<Args extends [...any[]], Item> implements Flow<Item>, Sink {
  readonly #sources: { [Index in keyof Args]: Flow<Args[Index]> };
  readonly #calc: (...args: Args) => Item;
  #dirty = true;
  #value: Item | undefined;
  #listeners: Array<Sink> = [];

  constructor(sources: { [Index in keyof Args]: Flow<Args[Index]> }, calc: (...args: Args) => Item) {
    this.#sources = sources;
    this.#calc = calc;
    sources.forEach(it => it.subscribe_(this));
  }

  get_(): Item {
    if (this.#dirty) {
      this.#value = this.#calc(...(this.#sources.map(src => src.get_()) as Args));
      this.#dirty = false;
    }

    return this.#value!;
  }

  debug_(): any {
    return {
      kind: 'flow',
      sources: this.#sources.map(it => it.debug_()),
      value: this.#value,
    };
  }

  markDirty_(): void {
    if (this.#dirty) {
      return;
    }

    this.#dirty = true;
    this.#value = undefined;
    this.#listeners.forEach(it => it.markDirty_());
  }

  subscribe_(sink: Sink) {
    this.#listeners.push(sink);
  }

  unsubscribe_(sink: Sink) {
    const index = this.#listeners.indexOf(sink);
    if (index !== -1) {
      this.#listeners.splice(index, 1);
    }
  }
}

class DefImpl<Args extends [...any[]], Item> implements Flow<Item>, Sink {
  readonly #sources: { [Index in keyof Args]: Flow<Args[Index]> };
  readonly #calc: (...args: Args) => Flow<Item>;
  #dirty = true;
  #value: Flow<Item> | undefined;
  #listeners: Array<Sink> = [];
  #listenerProxy: Sink = {
    markDirty_: () => {
      this.#listeners.forEach(it => it.markDirty_());
    }
  }

  constructor(sources: { [Index in keyof Args]: Flow<Args[Index]> }, calc: (...args: Args) => Flow<Item>) {
    this.#sources = sources;
    this.#calc = calc;
    sources.forEach(it => it.subscribe_(this));
  }

  get_(): Item {
    if (this.#dirty) {
      this.#value?.unsubscribe_(this.#listenerProxy);
      this.#value = this.#calc(...(this.#sources.map(src => src.get_()) as Args));
      this.#value!.subscribe_(this.#listenerProxy);
      this.#dirty = false;
    }

    return this.#value!.get_();
  }

  debug_(): any {
    return {
      kind: 'def',
      sources: this.#sources.map(it => it.debug_()),
    }
  }

  markDirty_(): void {
    if (this.#dirty) {
      return;
    }

    this.#dirty = true;
    this.#value = undefined;
    this.#listeners.forEach(it => it.markDirty_());
  }

  subscribe_(sink: Sink) {
    this.#listeners.push(sink);
  }

  unsubscribe_(sink: Sink) {
    const index = this.#listeners.indexOf(sink);
    if (index !== -1) {
      this.#listeners.splice(index, 1);
    }
  }
}

/**
 * This is how parts that listen to other parts are alerted that their sources changed
 */
export interface Sink {
  markDirty_(): void;
}

/**
 * This is a `flow`. You can ask it for its current value or subscribe to be informed when the `flow` is marked dirty.
 */
export interface Flow<Item> {
  get_(): Item;
  debug_(): any;
  subscribe_(sink: Sink): void;
  unsubscribe_(sink: Sink): void;
}

/**
 * This is how `var` is implemented, it extends flow, can be used anywhere flow is, but also allows you to update its value directly
 */
export interface Var<Item> extends Flow<Item> {
  set_(value: Item): void;
}

/**
 * singleton is used to convert a `val` or `const` into a `flow`
 */
export function singleton<Item>(value: Item): Flow<Item> {
  return new SingletonImpl(value);
}

/**
 * variable is used to implement a `var`
 */
export function variable<Item>(init: Item): Var<Item> {
  return new VarImpl(init);
}

/**
 * projection is used to implement a `var` projection, aka when you do `a.b = 3` `b` is the projection of `a` and allows you to indirectly mutate `a`
 */
export function projection<Base, Item>(root: Var<Base>, getter: (base: Base) => Item, setter: (base: Base, value: Item) => Base): Var<Item> {
  return new ProjectionImpl(root, getter, setter);
}

/**
 * flow is given a list of sources and a function to calculate a new value from those sources
 */
export function flow<Args extends [...any[]], Item>(sources: { [Index in keyof Args]: Flow<Args[Index]> }, calc: (...args: Args) => Item): Flow<Item> {
  return new FlowImpl(sources, calc);
}

/**
 * def is like flow but it expects the function to return a `flow` and it will then unwrap it. Basically this is a flow flatMap and exists to support calling `def` functions, hence the name
 */
export function def<Args extends [...any[]], Item>(sources: { [Index in keyof Args]: Flow<Args[Index]> }, calc: (...args: Args) => Flow<Item>): Flow<Item> {
  return new DefImpl(sources, calc);
}

export interface EffectContext {
  onCancel_(callback: () => void): void;
}

export function effect(action: Flow<(context: EffectContext) => void>): void {
  const context = new EffectContextImpl();
  const callback = () => {
    context.cancel_();
    action.get_()(context);
  };

  action.subscribe_({
    markDirty_() {
      if (!context.loaded) {
        context.loaded = true;
        setTimeout(callback, 0);
      }
    }
  });

  setTimeout(callback, 0);
}

class EffectContextImpl implements EffectContext {
  loaded: boolean = false;
  #cancelCallbacks: Array<() => void> = [];

  onCancel_(callback: () => void) {
    this.#cancelCallbacks.push(callback);
  }

  cancel_(): void {
    this.loaded = false;
    this.#cancelCallbacks.forEach(it => it());
    this.#cancelCallbacks = [];
  }
}

export function main<Model>(main: () => Flow<Model>, renderer: (model: Model) => void): void {
  const flow = main();

  let dirty = true;
  const redraw = () => {
    // mark us as no longer dirty
    dirty = false;
    // get the latest state
    const state = flow.get_();
    // render the state
    renderer(state);
  };

  flow.subscribe_({
    markDirty_(): void {
      if (!dirty) {
        dirty = true;
        setTimeout(redraw, 0);
      }
    }
  });
  redraw();
}


