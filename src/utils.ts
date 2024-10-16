
export function substringBeforeLast(base: string, prefix: string): string {
  const index = base.lastIndexOf(prefix);

  if (index === -1) {
    return base;
  } else {
    return base.substring(0, index);
  }
}

export function zip<Left, Right>(left: Array<Left>, right: Array<Right>): Array<[Left, Right]> {
  const out = new Array<[Left, Right]>();
  const limit = Math.min(left.length, right.length);

  for (let i = 0; i < limit; i++) {
    out.push([left[i]!!, right[i]!!]);
  }

  return out;
}
