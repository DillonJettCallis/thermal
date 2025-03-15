import { equals, type ThermalClass, thermalClass, type ThermalObject } from './reflect.js';
import { forEach as Vec_forEach, get as Vec_get, Vec } from '../lib/core/vector.ts';
import {
  entriesOf as Map_entriesOf,
  forEach as Map_forEach,
  has as Map_has,
  HashMap,
  keys as Map_keys
} from '../lib/core/map.ts';

interface IText {
  [thermalClass]: ThermalClass;
  text: string;
}

export interface ITag {
  [thermalClass]: ThermalClass;
  tag: string;
  attributes: HashMap<string, string>;
  onClick: (() => void) | undefined;
  children: Vec<ITag | IText>;
}

interface IHead {
  [thermalClass]: ThermalClass;
  title: string;
}

interface IHtml {
  [thermalClass]: ThermalClass;
  head: IHead;
  body: ITag;
}

let prev: IHtml | undefined;

export function domRenderer(next: IHtml): void {
  if (prev === undefined) {
    document.title = next.head.title;
    createTag(document.body, next.body);
  } else {
    if (!equals(prev.head, next.head)) {
      document.title = next.head.title;
    }
    updateTag(document.body, prev.body, next.body);
  }

  prev = next;
}

function isTag(obj: ThermalObject): obj is ITag {
  return obj[thermalClass].name === "Tag";
}

function isText(obj: ThermalObject): obj is IText {
  return obj[thermalClass].name === "Text";
}

function update(elem: Node, prev: ITag | IText, next: ITag | IText) {
  // nothing has changed, do nothing
  if (equals(prev, next)) {
    return;
  }

  // if everything agrees that this is a tag, update
  if (elem instanceof HTMLElement && isTag(prev) && isTag(next)) {
    updateTag(elem, prev, next);
  } else {
    // otherwise, destroy and recreate

    if (isText(next)) {
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

function updateTag(elem: HTMLElement, prev: ITag, next: ITag): void {
  if (prev.tag !== next.tag) {
    // if the tag itself has changed, just replace it with a newly created one
    const parent = elem.parentElement!;
    const newChild = document.createElement(next.tag)
    createTag(newChild, next);
    parent.replaceChild(newChild, elem);
  } else {
    // set attributes
    for (const {key, value} of Map_entriesOf(next.attributes.buckets)) {
      elem.setAttribute(key, value);
    }

    // remove any attributes that have been removed
    for (const key of Map_keys(prev.attributes)) {
      if (!Map_has(next.attributes, key)) {
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

function create(parent: HTMLElement, node: ITag | IText): void {
  if (isText(node)) {
    const newNode = document.createTextNode(node.text);
    parent.appendChild(newNode);
  } else {
    const newNode = document.createElement(node.tag);
    createTag(newNode, node);
    parent.appendChild(newNode);
  }
}

function createTag(elem: HTMLElement, node: ITag): void {
  Map_forEach(node.attributes, (value, key) => {
    elem.setAttribute(key, value);
  });

  if (node.onClick !== undefined) {
    elem.onclick = node.onClick;
  }

  Vec_forEach(node.children, child => {
    create(elem, child);
  });
}

function* multiZip(elem: HTMLElement, prev: Vec<IText | ITag>, next: Vec<IText | ITag>): IterableIterator<{ elemChild: Node | undefined, prevChild: IText | ITag | undefined, nextChild: IText | ITag | undefined }> {
  const elemChildren = safeChildNodes(elem);
  const max = Math.max(elemChildren.length, prev.size, next.size);

  for (let index = 0; index < max; index++) {
    yield {
      elemChild: elemChildren[index],
      prevChild: Vec_get(prev, index),
      nextChild: Vec_get(next, index),
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

