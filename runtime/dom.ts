import { is, List, Map, Record } from "immutable";

export class Text extends Record({
  text: '',
}) {
}

export class Tag extends Record({
  tag: '',
  attributes: Map<string, string>(),
  onClick: undefined as unknown as (() => void) | undefined,
  children: List<Tag | Text>(),
}) {
}

export const Element = {
  Text: Text,
  Tag: Tag,
};

export class Head extends Record({
  title: '',
}) {
}

export class Html extends Record({
  head: undefined as unknown as Head,
  body: undefined as unknown as Tag,
}) {
}

export function head(title: string): Head {
  return new Head({
    title,
  });
}

export function text(text: string): Text {
  return new Text({text});
}

export function tag(tag: string, mods: List<(tag: Tag) => Tag> | undefined): Tag {
  const base = new Tag({
    tag,
    attributes: Map(),
    onClick: undefined,
    children: List(),
  });

  if (mods === undefined) {
    return base;
  } else {
    return mods.reduce((prev, next) => next(prev), base);
  }
}

export function content(children: List<Tag | Text>): (tag: Tag) => Tag {
  return tag => tag.update('children', prev => prev.concat(children));
}

export function onClick(action: () => void): (tag: Tag) => Tag {
  return tag => tag.set('onClick', action);
}

export function attr(key: string, value: string): (tag: Tag) => Tag {
  return tag => tag.update('attributes', attr => attr.set(key, value));
}

export function style(style: string): (tag: Tag) => Tag {
  return tag => tag.update('attributes', attr => attr.update('style', prev => (prev === undefined ? '' : prev + ';') + style));
}

let prev: Html | undefined;

export function domRenderer(next: Html): void {
  if (prev === undefined) {
    document.title = next.head.title;
    createTag(document.body, next.body);
  } else {
    if (!is(prev.head, next.head)) {
      document.title = next.head.title;
    }
    updateTag(document.body, prev.body, next.body);
  }

  prev = next;
}

function update(elem: Node, prev: Tag | Text, next: Tag | Text) {
  // nothing has changed, do nothing
  if (is(prev, next)) {
    return;
  }

  // if everything agrees that this is a tag, update
  if (elem instanceof HTMLElement && prev instanceof Tag && next instanceof Tag) {
    updateTag(elem, prev, next);
  } else {
    // otherwise, destroy and recreate

    if (next instanceof Text) {
      const parent = elem.parentElement!;
      const newNode = document.createTextNode(next.text);
      parent.replaceChild(newNode, elem);
    } else {
      const parent = elem.parentElement!;
      const newNode = document.createElement(next.tag);
      createTag(newNode, next);
      parent.replaceChild(newNode, elem);
    }
  }

}

function updateTag(elem: HTMLElement, prev: Tag, next: Tag): void {
  if (prev.tag !== next.tag) {
    // if the tag itself has changed, just replace it with a newly created one
    const parent = elem.parentElement!;
    const newChild = document.createElement(next.tag)
    createTag(newChild, next);
    parent.replaceChild(newChild, elem);
  } else {
    // set attributes
    for (const [key, value] of next.attributes) {
      elem.setAttribute(key, value);
    }

    // remove any attributes that have been removed
    for (const key of prev.attributes.keys()) {
      if (!next.attributes.has(key)) {
        elem.removeAttribute(key);
      }
    }

    // update onclick
    if (prev.onClick !== next.onClick) {
      elem.onclick = next.onClick ?? null
    }

    // update children
    // TODO: support ids
    for (const {elemChild, prevChild, nextChild} of multiZip(elem, prev.children, next.children)) {
      // add
      if (elemChild == null && nextChild != null) {
        create(elem, nextChild)
      }

      // update
      if (elemChild != null && prevChild != null && nextChild != null) {
        update(elemChild, prevChild, nextChild)
      }

      // remove
      if (nextChild == null && elemChild != undefined) {
        elem.removeChild(elemChild)
      }
    }
  }
}

function create(parent: HTMLElement, node: Tag | Text): void {
  if (node instanceof Text) {
    const newNode = document.createTextNode(node.text);
    parent.appendChild(newNode);
  } else {
    const newNode = document.createElement(node.tag);
    createTag(newNode, node);
    parent.appendChild(newNode);
  }
}

function createTag(elem: HTMLElement, node: Tag): void {
  node.attributes.forEach((value, key) => {
    elem.setAttribute(key, value);
  });

  if (node.onClick !== undefined) {
    elem.onclick = node.onClick;
  }

  node.children.forEach(child => {
    create(elem, child);
  });
}

function* multiZip(elem: HTMLElement, prev: List<Text | Tag>, next: List<Text | Tag>): IterableIterator<{ elemChild: Node | undefined, prevChild: Text | Tag | undefined, nextChild: Text | Tag | undefined }> {
  const elemChildren = safeChildNodes(elem);
  const max = Math.max(elemChildren.length, prev.size, next.size);

  for (let index = 0; index < max; index++) {
    yield {
      elemChild: elemChildren[index],
      prevChild: prev.get(index),
      nextChild: next.get(index),
    }
  }
}

function safeChildNodes(elem: HTMLElement): { [index: number]: ChildNode, length: number } {
  if (elem instanceof HTMLBodyElement) {
    // if there are script elements in your body tag, ignore them. Do NOT allow them to impact the rest of our processing.
    return Array.from(elem.childNodes).filter(it => !(it instanceof HTMLScriptElement));
  } else {
    return elem.childNodes;
  }
}

