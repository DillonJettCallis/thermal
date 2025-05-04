import { type ThermalClass, thermalClassMarker } from '../../runtime/reflect.js';
import type { EffectContext } from '../../runtime/runtime.js';
import { effect as baseEffect, singleton } from '../../runtime/runtime.js'


export const Option: ThermalClass = {
  [thermalClassMarker]: true,
  fullName: 'base_Option',
  name: 'Option',
  generics: [{ name: 'Item', bound: undefined }],
  type: 'enum',
  enum: undefined,
  fields: {
    // @ts-ignore
    Some, None,
  }
}

export const Some: ThermalClass = {
  [thermalClassMarker]: true,
  fullName: 'base_Option_Some',
  name: 'Some',
  generics: [{ name: 'Item', bound: undefined }],
  type: 'struct',
  enum: Option,
  fields: {
    item: undefined as unknown as ThermalClass,
  }
}

export const None: ThermalClass = {
  [thermalClassMarker]: true,
  fullName: 'base_Option_None',
  name: 'None',
  generics: [{ name: 'Item', bound: undefined }],
  type: 'struct',
  enum: Option,
  fields: {}
}

export function onCancel(context: EffectContext, handler: () => void): void {
  context.onCancel(handler);
}

export function effect(handler: (context: EffectContext) => void): void {
  baseEffect(singleton(handler));
}

