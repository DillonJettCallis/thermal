import { type ThermalClass, thermalClassMarker } from '../../runtime/reflect.js';


export const Option: ThermalClass = {
  [thermalClassMarker]: true,
  fullName_: 'base_Option',
  name_: 'Option',
  generics_: [{ name: 'Item', bound: undefined }],
  type_: 'enum',
  enum_: undefined,
  fields_: {
    // @ts-ignore
    Some_: Some, None_: None,
  }
}

export const Some: ThermalClass = {
  [thermalClassMarker]: true,
  fullName_: 'base_Option_Some',
  name_: 'Some',
  generics_: [{ name: 'Item', bound: undefined }],
  type_: 'struct',
  enum_: Option,
  fields_: {
    item_: undefined as unknown as ThermalClass,
  }
}

export const None: ThermalClass = {
  [thermalClassMarker]: true,
  fullName_: 'base_Option_None',
  name_: 'None',
  generics_: [{ name: 'Item', bound: undefined }],
  type_: 'struct',
  enum_: Option,
  fields_: {}
}

