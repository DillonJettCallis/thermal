import { Map, List, Set, Record,  } from 'immutable';
import { Position, type ExpressionPhase, Symbol, type FunctionPhase, type Access, PackageName,  } from '../ast.ts';

export type CheckedTypeExpression
  = CheckedNominalType
  | CheckedParameterizedType
  | CheckedFunctionTypeParameter
  | CheckedTypeParameterType
  | CheckedFunctionType
  | CheckedOverloadFunctionType
  | CheckedModuleType
  | CheckedStructType
  | CheckedEnumTypeVariant
  | CheckedEnumType
  ;

export type CheckedExpression
  = CheckedBooleanLiteralEx
  | CheckedIntLiteralEx
  | CheckedFloatLiteralEx
  | CheckedStringLiteralEx
  | CheckedIdentifierEx
  | CheckedListLiteralEx
  | CheckedSetLiteralEx
  | CheckedMapLiteralEx
  | CheckedIsEx
  | CheckedNotEx
  | CheckedOrEx
  | CheckedAndEx
  | CheckedAccessEx
  | CheckedStaticAccessEx
  | CheckedConstructEx
  | CheckedLambdaEx
  | CheckedBlockEx
  | CheckedCallEx
  | CheckedIfEx
  | CheckedReturnEx
  ;

export type CheckedEnumTypeVariant
  = CheckedEnumTypeStructVariant
  | CheckedEnumTypeTupleVariant
  | CheckedEnumTypeAtomVariant
  ;

export type CheckedStatement
  = CheckedExpressionStatement
  | CheckedAssignmentStatement
  | CheckedReassignmentStatement
  | CheckedFunctionStatement
  ;

export type CheckedDeclaration
  = CheckedImportDeclaration
  | CheckedFunctionDeclare
  | CheckedStructDeclare
  | CheckedEnumDeclare
  | CheckedConstantDeclare
  ;

export type CheckedImportExpression
  = CheckedNominalImportExpression
  | CheckedNestedImportExpression
  ;

export type CheckedEnumVariant
  = CheckedEnumStructVariant
  | CheckedEnumTupleVariant
  | CheckedEnumAtomVariant
  ;

interface MutableCheckedBooleanLiteralEx {
  pos: Position;
  value: boolean;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedBooleanLiteralEx extends Record<MutableCheckedBooleanLiteralEx>({
  pos: undefined as unknown as Position,
  value: undefined as unknown as boolean,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedBooleanLiteralEx) {
    super(props);
  }
}

interface MutableCheckedIntLiteralEx {
  pos: Position;
  value: number;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedIntLiteralEx extends Record<MutableCheckedIntLiteralEx>({
  pos: undefined as unknown as Position,
  value: undefined as unknown as number,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedIntLiteralEx) {
    super(props);
  }
}

interface MutableCheckedFloatLiteralEx {
  pos: Position;
  value: number;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedFloatLiteralEx extends Record<MutableCheckedFloatLiteralEx>({
  pos: undefined as unknown as Position,
  value: undefined as unknown as number,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedFloatLiteralEx) {
    super(props);
  }
}

interface MutableCheckedStringLiteralEx {
  pos: Position;
  value: string;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedStringLiteralEx extends Record<MutableCheckedStringLiteralEx>({
  pos: undefined as unknown as Position,
  value: undefined as unknown as string,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedStringLiteralEx) {
    super(props);
  }
}

interface MutableCheckedIdentifierEx {
  pos: Position;
  name: string;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedIdentifierEx extends Record<MutableCheckedIdentifierEx>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedIdentifierEx) {
    super(props);
  }
}

interface MutableCheckedNominalType {
  name: Symbol;
}
export class CheckedNominalType extends Record<MutableCheckedNominalType>({
  name: undefined as unknown as Symbol,
}) {
  constructor(props: MutableCheckedNominalType) {
    super(props);
  }
}

interface MutableCheckedParameterizedType {
  base: CheckedNominalType;
  args: List<CheckedTypeExpression>;
}
export class CheckedParameterizedType extends Record<MutableCheckedParameterizedType>({
  base: undefined as unknown as CheckedNominalType,
  args: undefined as unknown as List<CheckedTypeExpression>,
}) {
  constructor(props: MutableCheckedParameterizedType) {
    super(props);
  }
}

interface MutableCheckedFunctionTypeParameter {
  phase: ExpressionPhase | undefined;
  type: CheckedTypeExpression;
}
export class CheckedFunctionTypeParameter extends Record<MutableCheckedFunctionTypeParameter>({
  phase: undefined as unknown as ExpressionPhase | undefined,
  type: undefined as unknown as CheckedTypeExpression,
}) {
  constructor(props: MutableCheckedFunctionTypeParameter) {
    super(props);
  }
}

interface MutableCheckedTypeParameterType {
  name: Symbol;
}
export class CheckedTypeParameterType extends Record<MutableCheckedTypeParameterType>({
  name: undefined as unknown as Symbol,
}) {
  constructor(props: MutableCheckedTypeParameterType) {
    super(props);
  }
}

interface MutableCheckedFunctionType {
  phase: FunctionPhase;
  typeParams: List<CheckedTypeParameterType>;
  params: List<CheckedFunctionTypeParameter>;
  result: CheckedTypeExpression;
}
export class CheckedFunctionType extends Record<MutableCheckedFunctionType>({
  phase: undefined as unknown as FunctionPhase,
  typeParams: undefined as unknown as List<CheckedTypeParameterType>,
  params: undefined as unknown as List<CheckedFunctionTypeParameter>,
  result: undefined as unknown as CheckedTypeExpression,
}) {
  constructor(props: MutableCheckedFunctionType) {
    super(props);
  }
}

interface MutableCheckedOverloadFunctionType {
  branches: List<CheckedFunctionType>;
}
export class CheckedOverloadFunctionType extends Record<MutableCheckedOverloadFunctionType>({
  branches: undefined as unknown as List<CheckedFunctionType>,
}) {
  constructor(props: MutableCheckedOverloadFunctionType) {
    super(props);
  }
}

interface MutableCheckedModuleType {
  name: Symbol;
}
export class CheckedModuleType extends Record<MutableCheckedModuleType>({
  name: undefined as unknown as Symbol,
}) {
  constructor(props: MutableCheckedModuleType) {
    super(props);
  }
}

interface MutableCheckedStructType {
  pos: Position;
  name: Symbol;
  typeParams: List<CheckedTypeParameterType>;
  fields: Map<string, CheckedTypeExpression>;
}
export class CheckedStructType extends Record<MutableCheckedStructType>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as Symbol,
  typeParams: undefined as unknown as List<CheckedTypeParameterType>,
  fields: undefined as unknown as Map<string, CheckedTypeExpression>,
}) {
  constructor(props: MutableCheckedStructType) {
    super(props);
  }
}

interface MutableCheckedEnumType {
  pos: Position;
  name: Symbol;
  typeParams: List<CheckedTypeParameterType>;
  variants: Map<string, CheckedEnumTypeVariant>;
}
export class CheckedEnumType extends Record<MutableCheckedEnumType>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as Symbol,
  typeParams: undefined as unknown as List<CheckedTypeParameterType>,
  variants: undefined as unknown as Map<string, CheckedEnumTypeVariant>,
}) {
  constructor(props: MutableCheckedEnumType) {
    super(props);
  }
}

interface MutableCheckedEnumTypeStructVariant {
  pos: Position;
  name: Symbol;
  fields: Map<string, CheckedTypeExpression>;
}
export class CheckedEnumTypeStructVariant extends Record<MutableCheckedEnumTypeStructVariant>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as Symbol,
  fields: undefined as unknown as Map<string, CheckedTypeExpression>,
}) {
  constructor(props: MutableCheckedEnumTypeStructVariant) {
    super(props);
  }
}

interface MutableCheckedEnumTypeTupleVariant {
  pos: Position;
  name: Symbol;
  fields: List<CheckedTypeExpression>;
}
export class CheckedEnumTypeTupleVariant extends Record<MutableCheckedEnumTypeTupleVariant>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as Symbol,
  fields: undefined as unknown as List<CheckedTypeExpression>,
}) {
  constructor(props: MutableCheckedEnumTypeTupleVariant) {
    super(props);
  }
}

interface MutableCheckedEnumTypeAtomVariant {
  pos: Position;
  name: Symbol;
}
export class CheckedEnumTypeAtomVariant extends Record<MutableCheckedEnumTypeAtomVariant>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as Symbol,
}) {
  constructor(props: MutableCheckedEnumTypeAtomVariant) {
    super(props);
  }
}

interface MutableCheckedListLiteralEx {
  pos: Position;
  values: List<CheckedExpression>;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedListLiteralEx extends Record<MutableCheckedListLiteralEx>({
  pos: undefined as unknown as Position,
  values: undefined as unknown as List<CheckedExpression>,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedListLiteralEx) {
    super(props);
  }
}

interface MutableCheckedSetLiteralEx {
  pos: Position;
  values: List<CheckedExpression>;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedSetLiteralEx extends Record<MutableCheckedSetLiteralEx>({
  pos: undefined as unknown as Position,
  values: undefined as unknown as List<CheckedExpression>,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedSetLiteralEx) {
    super(props);
  }
}

interface MutableCheckedMapLiteralEntry {
  pos: Position;
  key: CheckedExpression;
  value: CheckedExpression;
}
export class CheckedMapLiteralEntry extends Record<MutableCheckedMapLiteralEntry>({
  pos: undefined as unknown as Position,
  key: undefined as unknown as CheckedExpression,
  value: undefined as unknown as CheckedExpression,
}) {
  constructor(props: MutableCheckedMapLiteralEntry) {
    super(props);
  }
}

interface MutableCheckedMapLiteralEx {
  pos: Position;
  values: List<CheckedMapLiteralEntry>;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedMapLiteralEx extends Record<MutableCheckedMapLiteralEx>({
  pos: undefined as unknown as Position,
  values: undefined as unknown as List<CheckedMapLiteralEntry>,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedMapLiteralEx) {
    super(props);
  }
}

interface MutableCheckedIsEx {
  pos: Position;
  not: boolean;
  base: CheckedExpression;
  check: CheckedTypeExpression;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedIsEx extends Record<MutableCheckedIsEx>({
  pos: undefined as unknown as Position,
  not: undefined as unknown as boolean,
  base: undefined as unknown as CheckedExpression,
  check: undefined as unknown as CheckedTypeExpression,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedIsEx) {
    super(props);
  }
}

interface MutableCheckedNotEx {
  pos: Position;
  base: CheckedExpression;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedNotEx extends Record<MutableCheckedNotEx>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as CheckedExpression,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedNotEx) {
    super(props);
  }
}

interface MutableCheckedOrEx {
  pos: Position;
  left: CheckedExpression;
  right: CheckedExpression;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedOrEx extends Record<MutableCheckedOrEx>({
  pos: undefined as unknown as Position,
  left: undefined as unknown as CheckedExpression,
  right: undefined as unknown as CheckedExpression,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedOrEx) {
    super(props);
  }
}

interface MutableCheckedAndEx {
  pos: Position;
  left: CheckedExpression;
  right: CheckedExpression;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedAndEx extends Record<MutableCheckedAndEx>({
  pos: undefined as unknown as Position,
  left: undefined as unknown as CheckedExpression,
  right: undefined as unknown as CheckedExpression,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedAndEx) {
    super(props);
  }
}

interface MutableCheckedAccessEx {
  pos: Position;
  base: CheckedExpression;
  field: CheckedIdentifierEx;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedAccessEx extends Record<MutableCheckedAccessEx>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as CheckedExpression,
  field: undefined as unknown as CheckedIdentifierEx,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedAccessEx) {
    super(props);
  }
}

interface MutableCheckedStaticAccessEx {
  pos: Position;
  path: List<CheckedIdentifierEx>;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedStaticAccessEx extends Record<MutableCheckedStaticAccessEx>({
  pos: undefined as unknown as Position,
  path: undefined as unknown as List<CheckedIdentifierEx>,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedStaticAccessEx) {
    super(props);
  }
}

interface MutableCheckedConstructEntry {
  pos: Position;
  name: string;
  value: CheckedExpression;
}
export class CheckedConstructEntry extends Record<MutableCheckedConstructEntry>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
  value: undefined as unknown as CheckedExpression,
}) {
  constructor(props: MutableCheckedConstructEntry) {
    super(props);
  }
}

interface MutableCheckedConstructEx {
  pos: Position;
  base: CheckedExpression;
  typeArgs: List<CheckedTypeExpression>;
  fields: List<CheckedConstructEntry>;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedConstructEx extends Record<MutableCheckedConstructEx>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as CheckedExpression,
  typeArgs: undefined as unknown as List<CheckedTypeExpression>,
  fields: undefined as unknown as List<CheckedConstructEntry>,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedConstructEx) {
    super(props);
  }
}

interface MutableCheckedParameter {
  pos: Position;
  name: string;
  phase: ExpressionPhase | undefined;
  type: CheckedTypeExpression;
}
export class CheckedParameter extends Record<MutableCheckedParameter>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
  phase: undefined as unknown as ExpressionPhase | undefined,
  type: undefined as unknown as CheckedTypeExpression,
}) {
  constructor(props: MutableCheckedParameter) {
    super(props);
  }
}

interface MutableCheckedLambdaEx {
  pos: Position;
  functionPhase: FunctionPhase;
  params: List<CheckedParameter>;
  body: CheckedExpression;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedLambdaEx extends Record<MutableCheckedLambdaEx>({
  pos: undefined as unknown as Position,
  functionPhase: undefined as unknown as FunctionPhase,
  params: undefined as unknown as List<CheckedParameter>,
  body: undefined as unknown as CheckedExpression,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedLambdaEx) {
    super(props);
  }
}

interface MutableCheckedBlockEx {
  pos: Position;
  body: List<CheckedStatement>;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedBlockEx extends Record<MutableCheckedBlockEx>({
  pos: undefined as unknown as Position,
  body: undefined as unknown as List<CheckedStatement>,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedBlockEx) {
    super(props);
  }
}

interface MutableCheckedExpressionStatement {
  pos: Position;
  expression: CheckedExpression;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedExpressionStatement extends Record<MutableCheckedExpressionStatement>({
  pos: undefined as unknown as Position,
  expression: undefined as unknown as CheckedExpression,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedExpressionStatement) {
    super(props);
  }
}

interface MutableCheckedAssignmentStatement {
  pos: Position;
  name: string;
  phase: ExpressionPhase;
  type: CheckedTypeExpression;
  expression: CheckedExpression;
}
export class CheckedAssignmentStatement extends Record<MutableCheckedAssignmentStatement>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
  phase: undefined as unknown as ExpressionPhase,
  type: undefined as unknown as CheckedTypeExpression,
  expression: undefined as unknown as CheckedExpression,
}) {
  constructor(props: MutableCheckedAssignmentStatement) {
    super(props);
  }
}

interface MutableCheckedReassignmentStatement {
  pos: Position;
  name: string;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
  expression: CheckedExpression;
}
export class CheckedReassignmentStatement extends Record<MutableCheckedReassignmentStatement>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
  expression: undefined as unknown as CheckedExpression,
}) {
  constructor(props: MutableCheckedReassignmentStatement) {
    super(props);
  }
}

interface MutableCheckedFunctionStatement {
  pos: Position;
  phase: ExpressionPhase;
  name: string;
  typeParams: List<CheckedTypeParameterType>;
  result: CheckedTypeExpression;
  lambda: CheckedLambdaEx;
  type: CheckedTypeExpression;
}
export class CheckedFunctionStatement extends Record<MutableCheckedFunctionStatement>({
  pos: undefined as unknown as Position,
  phase: undefined as unknown as ExpressionPhase,
  name: undefined as unknown as string,
  typeParams: undefined as unknown as List<CheckedTypeParameterType>,
  result: undefined as unknown as CheckedTypeExpression,
  lambda: undefined as unknown as CheckedLambdaEx,
  type: undefined as unknown as CheckedTypeExpression,
}) {
  constructor(props: MutableCheckedFunctionStatement) {
    super(props);
  }
}

interface MutableCheckedCallEx {
  pos: Position;
  func: CheckedExpression;
  typeArgs: List<CheckedTypeExpression>;
  args: List<CheckedExpression>;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedCallEx extends Record<MutableCheckedCallEx>({
  pos: undefined as unknown as Position,
  func: undefined as unknown as CheckedExpression,
  typeArgs: undefined as unknown as List<CheckedTypeExpression>,
  args: undefined as unknown as List<CheckedExpression>,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedCallEx) {
    super(props);
  }
}

interface MutableCheckedIfEx {
  pos: Position;
  condition: CheckedExpression;
  thenEx: CheckedExpression;
  elseEx: CheckedExpression | undefined;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedIfEx extends Record<MutableCheckedIfEx>({
  pos: undefined as unknown as Position,
  condition: undefined as unknown as CheckedExpression,
  thenEx: undefined as unknown as CheckedExpression,
  elseEx: undefined as unknown as CheckedExpression | undefined,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedIfEx) {
    super(props);
  }
}

interface MutableCheckedReturnEx {
  pos: Position;
  base: CheckedExpression;
  type: CheckedTypeExpression;
  phase: ExpressionPhase;
}
export class CheckedReturnEx extends Record<MutableCheckedReturnEx>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as CheckedExpression,
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
}) {
  constructor(props: MutableCheckedReturnEx) {
    super(props);
  }
}

interface MutableCheckedNominalImportExpression {
  pos: Position;
  name: string;
}
export class CheckedNominalImportExpression extends Record<MutableCheckedNominalImportExpression>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
}) {
  constructor(props: MutableCheckedNominalImportExpression) {
    super(props);
  }
}

interface MutableCheckedNestedImportExpression {
  pos: Position;
  base: CheckedNominalImportExpression;
  children: List<CheckedImportExpression>;
}
export class CheckedNestedImportExpression extends Record<MutableCheckedNestedImportExpression>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as CheckedNominalImportExpression,
  children: undefined as unknown as List<CheckedImportExpression>,
}) {
  constructor(props: MutableCheckedNestedImportExpression) {
    super(props);
  }
}

interface MutableCheckedImportDeclaration {
  pos: Position;
  package: CheckedNominalImportExpression;
  ex: CheckedImportExpression;
}
export class CheckedImportDeclaration extends Record<MutableCheckedImportDeclaration>({
  pos: undefined as unknown as Position,
  package: undefined as unknown as CheckedNominalImportExpression,
  ex: undefined as unknown as CheckedImportExpression,
}) {
  constructor(props: MutableCheckedImportDeclaration) {
    super(props);
  }
}

interface MutableCheckedFunctionDeclare {
  pos: Position;
  extern: boolean;
  access: Access;
  symbol: Symbol;
  func: CheckedFunctionStatement;
}
export class CheckedFunctionDeclare extends Record<MutableCheckedFunctionDeclare>({
  pos: undefined as unknown as Position,
  extern: undefined as unknown as boolean,
  access: undefined as unknown as Access,
  symbol: undefined as unknown as Symbol,
  func: undefined as unknown as CheckedFunctionStatement,
}) {
  constructor(props: MutableCheckedFunctionDeclare) {
    super(props);
  }
}

interface MutableCheckedStructField {
  pos: Position;
  type: CheckedTypeExpression;
  default: CheckedExpression | undefined;
}
export class CheckedStructField extends Record<MutableCheckedStructField>({
  pos: undefined as unknown as Position,
  type: undefined as unknown as CheckedTypeExpression,
  default: undefined as unknown as CheckedExpression | undefined,
}) {
  constructor(props: MutableCheckedStructField) {
    super(props);
  }
}

interface MutableCheckedStructDeclare {
  pos: Position;
  access: Access;
  symbol: Symbol;
  name: string;
  typeParams: List<CheckedTypeParameterType>;
  fields: Map<string, CheckedStructField>;
}
export class CheckedStructDeclare extends Record<MutableCheckedStructDeclare>({
  pos: undefined as unknown as Position,
  access: undefined as unknown as Access,
  symbol: undefined as unknown as Symbol,
  name: undefined as unknown as string,
  typeParams: undefined as unknown as List<CheckedTypeParameterType>,
  fields: undefined as unknown as Map<string, CheckedStructField>,
}) {
  constructor(props: MutableCheckedStructDeclare) {
    super(props);
  }
}

interface MutableCheckedEnumStructVariant {
  pos: Position;
  symbol: Symbol;
  fields: Map<string, CheckedStructField>;
}
export class CheckedEnumStructVariant extends Record<MutableCheckedEnumStructVariant>({
  pos: undefined as unknown as Position,
  symbol: undefined as unknown as Symbol,
  fields: undefined as unknown as Map<string, CheckedStructField>,
}) {
  constructor(props: MutableCheckedEnumStructVariant) {
    super(props);
  }
}

interface MutableCheckedEnumTupleVariant {
  pos: Position;
  symbol: Symbol;
  fields: List<CheckedTypeExpression>;
}
export class CheckedEnumTupleVariant extends Record<MutableCheckedEnumTupleVariant>({
  pos: undefined as unknown as Position,
  symbol: undefined as unknown as Symbol,
  fields: undefined as unknown as List<CheckedTypeExpression>,
}) {
  constructor(props: MutableCheckedEnumTupleVariant) {
    super(props);
  }
}

interface MutableCheckedEnumAtomVariant {
  pos: Position;
  symbol: Symbol;
}
export class CheckedEnumAtomVariant extends Record<MutableCheckedEnumAtomVariant>({
  pos: undefined as unknown as Position,
  symbol: undefined as unknown as Symbol,
}) {
  constructor(props: MutableCheckedEnumAtomVariant) {
    super(props);
  }
}

interface MutableCheckedEnumDeclare {
  pos: Position;
  access: Access;
  symbol: Symbol;
  name: string;
  typeParams: List<CheckedTypeParameterType>;
  variants: Map<string, CheckedEnumVariant>;
}
export class CheckedEnumDeclare extends Record<MutableCheckedEnumDeclare>({
  pos: undefined as unknown as Position,
  access: undefined as unknown as Access,
  symbol: undefined as unknown as Symbol,
  name: undefined as unknown as string,
  typeParams: undefined as unknown as List<CheckedTypeParameterType>,
  variants: undefined as unknown as Map<string, CheckedEnumVariant>,
}) {
  constructor(props: MutableCheckedEnumDeclare) {
    super(props);
  }
}

interface MutableCheckedConstantDeclare {
  pos: Position;
  access: Access;
  symbol: Symbol;
  name: string;
  expression: CheckedExpression;
  type: CheckedTypeExpression;
}
export class CheckedConstantDeclare extends Record<MutableCheckedConstantDeclare>({
  pos: undefined as unknown as Position,
  access: undefined as unknown as Access,
  symbol: undefined as unknown as Symbol,
  name: undefined as unknown as string,
  expression: undefined as unknown as CheckedExpression,
  type: undefined as unknown as CheckedTypeExpression,
}) {
  constructor(props: MutableCheckedConstantDeclare) {
    super(props);
  }
}

interface MutableCheckedFile {
  src: string;
  module: Symbol;
  declarations: List<CheckedDeclaration>;
}
export class CheckedFile extends Record<MutableCheckedFile>({
  src: undefined as unknown as string,
  module: undefined as unknown as Symbol,
  declarations: undefined as unknown as List<CheckedDeclaration>,
}) {
  constructor(props: MutableCheckedFile) {
    super(props);
  }
}

interface MutableCheckedAccessRecord {
  access: Access;
  module: Symbol;
  type: CheckedTypeExpression;
}
export class CheckedAccessRecord extends Record<MutableCheckedAccessRecord>({
  access: undefined as unknown as Access,
  module: undefined as unknown as Symbol,
  type: undefined as unknown as CheckedTypeExpression,
}) {
  constructor(props: MutableCheckedAccessRecord) {
    super(props);
  }
}

interface MutableCheckedPackage {
  name: PackageName;
  files: List<CheckedFile>;
  declarations: Map<Symbol, CheckedAccessRecord>;
}
export class CheckedPackage extends Record<MutableCheckedPackage>({
  name: undefined as unknown as PackageName,
  files: undefined as unknown as List<CheckedFile>,
  declarations: undefined as unknown as Map<Symbol, CheckedAccessRecord>,
}) {
  constructor(props: MutableCheckedPackage) {
    super(props);
  }
}

