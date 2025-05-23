
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

export function negateOp_Int(self: number): number {
  return -self;
}

export function equal_Int(self: number, other: number): boolean {
  return self === other;
}

export function notEqual_Int(self: number, other: number): boolean {
  return self !== other;
}

export function compareInt(left: number, right: number): number {
  if (left > right) {
    return 1;
  } else if (left < right) {
    return -1;
  } else {
    return 0;
  }
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

export function negateOp_Float(self: number): number {
  return -self;
}

export function equal_Float(self: number, other: number): boolean {
  return self === other;
}

export function notEqual_Float(self: number, other: number): boolean {
  return self !== other;
}

export function compareFloat(left: number, right: number): number {
  if (left > right) {
    return 1;
  } else if (left < right) {
    return -1;
  } else {
    return 0;
  }
}
