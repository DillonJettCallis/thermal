import { List } from 'immutable';

export function substringBeforeLast(base: string, prefix: string): string {
  const index = base.lastIndexOf(prefix);

  if (index === -1) {
    return base;
  } else {
    return base.substring(0, index);
  }
}

export function substringAfterLast(base: string, suffix: string): string {
  const index = base.lastIndexOf(suffix);

  if (index === -1) {
    return base;
  } else {
    return base.substring(index + 1);
  }
}

export function scan<Input, Output, Reduction>(src: Iterable<Input>, sum: Reduction, handler: (sum: Reduction, next: Input) => [sum: Reduction, out: Output]): readonly [sum: Reduction, out: List<Output>] {
  const out = List<Output>().asMutable();
  let mid: Output;

  for (const next of src) {
    [sum, mid] = handler(sum, next);
    out.push(mid);
  }

  return [sum, out.asImmutable()] as const;
}
