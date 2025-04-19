
// Int
export function toString_Int(self: number): string {
  return String(self);
}

export function addOp_Int(self: number, other: number): number {
  return (self + other) | 0;
}

export function subtractOp_Int(self: number, other: number): number {
  return (self - other) | 0;
}

export function multiplyOp_Int(self: number, other: number): number {
  return (self * other) | 0;
}

export function divideOp_Int(self: number, other: number): number {
  return (self / other) | 0;
}


// Float
export function toString_Float(self: number): string {
  return String(self);
}

export function addOp_Float(self: number, other: number): number {
  return self + other;
}

export function subtractOp_Float(self: number, other: number): number {
  return self - other;
}

export function multiplyOp_Float(self: number, other: number): number {
  return self * other;
}

export function divideOp_Float(self: number, other: number): number {
  return self / other;
}
