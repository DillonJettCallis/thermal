
export function substringBeforeLast(base: string, prefix: string): string {
  const index = base.lastIndexOf(prefix);

  if (index === -1) {
    return base;
  } else {
    return base.substring(0, index);
  }
}
