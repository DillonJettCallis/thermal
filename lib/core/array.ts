
export function size(arr: Array<any>): number {
  return arr.length;
}

export function get<Item>(arr: Array<Item>, index: number): Item {
  return arr[index]!;
}

export function set<Item>(arr: Array<Item>, index: number, item: Item): Array<Item> {
  return arr.with(index, item);
}

export function add<Item>(arr: Array<Item>, item: Item): Array<Item> {
  return [...arr, item];
}


