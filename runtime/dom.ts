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
  text_: string;
}

export interface ITag {
  [thermalClass]: ThermalClass;
  tag_: string;
  attributes_: HashMap<string, string>;
  onClick_: (() => void) | undefined;
  children_: Vec<ITag | IText>;
}

interface IHead {
  [thermalClass]: ThermalClass;
  title_: string;
}

interface IHtml {
  [thermalClass]: ThermalClass;
  head_: IHead;
  body_: ITag;
}

let prev: IHtml | undefined;

export function domRenderer(next: IHtml): void {
  if (prev === undefined) {
    document.title = next.head_.title_;
    createTag(document.body, next.body_);
  } else {
    if (!equals(prev.head_, next.head_)) {
      document.title = next.head_.title_;
    }
    updateTag(document.body, prev.body_, next.body_);
  }

  prev = next;
}

function isTag(obj: ThermalObject): obj is ITag {
  return obj[thermalClass].name_ === "Tag";
}

function isText(obj: ThermalObject): obj is IText {
  return obj[thermalClass].name_ === "Text";
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
      const newNode = document.createTextNode(next.text_);
      parent.replaceChild(newNode, elem);
    } else {
      const parent = elem.parentElement!;
      const newNode = document.createElement(next.tag_);
      createTag(newNode, next);
      parent.replaceChild(newNode, elem);
    }
  }

}

function updateTag(elem: HTMLElement, prev: ITag, next: ITag): void {
  if (prev.tag_ !== next.tag_) {
    // if the tag itself has changed, just replace it with a newly created one
    const parent = elem.parentElement!;
    const newChild = document.createElement(next.tag_)
    createTag(newChild, next);
    parent.replaceChild(newChild, elem);
  } else {
    // set attributes
    for (const {key_, value_} of Map_entriesOf(next.attributes_.buckets_)) {
      elem.setAttribute(key, value);
    }

    // remove any attributes that have been removed
    for (const key of Map_keys(prev.attributes_)) {
      if (!Map_has(next.attributes_, key)) {
        elem.removeAttribute(key);
      }
    }

    // update onclick
    if (prev.onClick_ !== next.onClick_) {
      elem.onclick = next.onClick_ ?? null
    }

    // update children
    // TODO: support ids
    for (const {elemChild, prevChild, nextChild} of multiZip(elem, prev.children_, next.children_)) {
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
    const newNode = document.createTextNode(node.text_);
    parent.appendChild(newNode);
  } else {
    const newNode = document.createElement(node.tag_);
    createTag(newNode, node);
    parent.appendChild(newNode);
  }
}

function createTag(elem: HTMLElement, node: ITag): void {
  Map_forEach(node.attributes_, (value, key) => {
    elem.setAttribute(key, value);
  });

  if (node.onClick_ !== undefined) {
    elem.onclick = node.onClick_;
  }

  Vec_forEach(node.children_, child => {
    create(elem, child);
  });
}

function* multiZip(elem: HTMLElement, prev: Vec<IText | ITag>, next: Vec<IText | ITag>): IterableIterator<{ elemChild: Node | undefined, prevChild: IText | ITag | undefined, nextChild: IText | ITag | undefined }> {
  const elemChildren = safeChildNodes(elem);
  const max = Math.max(elemChildren.length, prev.size_, next.size_);

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

