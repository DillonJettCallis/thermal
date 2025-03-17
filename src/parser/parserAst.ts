import { List, Map, Record } from 'immutable';
import { type Access, type ExpressionPhase, type FunctionPhase, Position, Symbol } from '../ast.ts';

export type ParserTypeExpression
  = ParserConcreteType
  | ParserFunctionTypeParameter
  | ParserFunctionType
  | ParserTypeParameterType
  ;

export type ParserExpression
  = ParserBooleanLiteralEx
  | ParserIntLiteralEx
  | ParserFloatLiteralEx
  | ParserStringLiteralEx
  | ParserIdentifierEx
  | ParserListLiteralEx
  | ParserSetLiteralEx
  | ParserMapLiteralEx
  | ParserIsEx
  | ParserNotEx
  | ParserOrEx
  | ParserAndEx
  | ParserAccessEx
  | ParserStaticAccessEx
  | ParserConstructEx
  | ParserLambdaEx
  | ParserBlockEx
  | ParserNoOpEx
  | ParserCallEx
  | ParserIfEx
  | ParserReturnEx
  ;

export type ParserConcreteType
  = ParserNominalType
  | ParserParameterizedType
  ;

export type ParserStatement
  = ParserExpressionStatement
  | ParserAssignmentStatement
  | ParserReassignmentStatement
  | ParserFunctionStatement
  ;

export type ParserFunction
  = ParserFunctionStatement
  | ParserFunctionDeclare
  ;

export type ParserDeclaration
  = ParserImportDeclaration
  | ParserFunctionDeclare
  | ParserDataDeclare
  | ParserEnumDeclare
  | ParserConstantDeclare
  | ParserImplDeclare
  ;

export type ParserImportExpression
  = ParserNominalImportExpression
  | ParserNestedImportExpression
  ;

export type ParserDataLayout
  = ParserStruct
  | ParserTuple
  | ParserAtom
  ;

interface MutableParserBooleanLiteralEx {
  pos: Position;
  value: boolean;
}
export class ParserBooleanLiteralEx extends Record<MutableParserBooleanLiteralEx>({
  pos: undefined as unknown as Position,
  value: undefined as unknown as boolean,
}) {
  constructor(props: MutableParserBooleanLiteralEx) {
    super(props);
  }
}

interface MutableParserIntLiteralEx {
  pos: Position;
  value: number;
}
export class ParserIntLiteralEx extends Record<MutableParserIntLiteralEx>({
  pos: undefined as unknown as Position,
  value: undefined as unknown as number,
}) {
  constructor(props: MutableParserIntLiteralEx) {
    super(props);
  }
}

interface MutableParserFloatLiteralEx {
  pos: Position;
  value: number;
}
export class ParserFloatLiteralEx extends Record<MutableParserFloatLiteralEx>({
  pos: undefined as unknown as Position,
  value: undefined as unknown as number,
}) {
  constructor(props: MutableParserFloatLiteralEx) {
    super(props);
  }
}

interface MutableParserStringLiteralEx {
  pos: Position;
  value: string;
}
export class ParserStringLiteralEx extends Record<MutableParserStringLiteralEx>({
  pos: undefined as unknown as Position,
  value: undefined as unknown as string,
}) {
  constructor(props: MutableParserStringLiteralEx) {
    super(props);
  }
}

interface MutableParserIdentifierEx {
  pos: Position;
  name: string;
}
export class ParserIdentifierEx extends Record<MutableParserIdentifierEx>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
}) {
  constructor(props: MutableParserIdentifierEx) {
    super(props);
  }
}

interface MutableParserNominalType {
  pos: Position;
  name: List<ParserIdentifierEx>;
}
export class ParserNominalType extends Record<MutableParserNominalType>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as List<ParserIdentifierEx>,
}) {
  constructor(props: MutableParserNominalType) {
    super(props);
  }
}

interface MutableParserParameterizedType {
  pos: Position;
  base: ParserNominalType;
  args: List<ParserTypeExpression>;
}
export class ParserParameterizedType extends Record<MutableParserParameterizedType>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as ParserNominalType,
  args: undefined as unknown as List<ParserTypeExpression>,
}) {
  constructor(props: MutableParserParameterizedType) {
    super(props);
  }
}

interface MutableParserFunctionTypeParameter {
  pos: Position;
  phase: ExpressionPhase | undefined;
  type: ParserTypeExpression;
}
export class ParserFunctionTypeParameter extends Record<MutableParserFunctionTypeParameter>({
  pos: undefined as unknown as Position,
  phase: undefined as unknown as ExpressionPhase | undefined,
  type: undefined as unknown as ParserTypeExpression,
}) {
  constructor(props: MutableParserFunctionTypeParameter) {
    super(props);
  }
}

interface MutableParserFunctionType {
  pos: Position;
  phase: FunctionPhase;
  params: List<ParserFunctionTypeParameter>;
  result: ParserTypeExpression;
}
export class ParserFunctionType extends Record<MutableParserFunctionType>({
  pos: undefined as unknown as Position,
  phase: undefined as unknown as FunctionPhase,
  params: undefined as unknown as List<ParserFunctionTypeParameter>,
  result: undefined as unknown as ParserTypeExpression,
}) {
  constructor(props: MutableParserFunctionType) {
    super(props);
  }
}

interface MutableParserTypeParameterType {
  pos: Position;
  name: string;
}
export class ParserTypeParameterType extends Record<MutableParserTypeParameterType>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
}) {
  constructor(props: MutableParserTypeParameterType) {
    super(props);
  }
}

interface MutableParserListLiteralEx {
  pos: Position;
  values: List<ParserExpression>;
}
export class ParserListLiteralEx extends Record<MutableParserListLiteralEx>({
  pos: undefined as unknown as Position,
  values: undefined as unknown as List<ParserExpression>,
}) {
  constructor(props: MutableParserListLiteralEx) {
    super(props);
  }
}

interface MutableParserSetLiteralEx {
  pos: Position;
  values: List<ParserExpression>;
}
export class ParserSetLiteralEx extends Record<MutableParserSetLiteralEx>({
  pos: undefined as unknown as Position,
  values: undefined as unknown as List<ParserExpression>,
}) {
  constructor(props: MutableParserSetLiteralEx) {
    super(props);
  }
}

interface MutableParserMapLiteralEntry {
  pos: Position;
  key: ParserExpression;
  value: ParserExpression;
}
export class ParserMapLiteralEntry extends Record<MutableParserMapLiteralEntry>({
  pos: undefined as unknown as Position,
  key: undefined as unknown as ParserExpression,
  value: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserMapLiteralEntry) {
    super(props);
  }
}

interface MutableParserMapLiteralEx {
  pos: Position;
  values: List<ParserMapLiteralEntry>;
}
export class ParserMapLiteralEx extends Record<MutableParserMapLiteralEx>({
  pos: undefined as unknown as Position,
  values: undefined as unknown as List<ParserMapLiteralEntry>,
}) {
  constructor(props: MutableParserMapLiteralEx) {
    super(props);
  }
}

interface MutableParserIsEx {
  pos: Position;
  not: boolean;
  base: ParserExpression;
  check: ParserTypeExpression;
}
export class ParserIsEx extends Record<MutableParserIsEx>({
  pos: undefined as unknown as Position,
  not: undefined as unknown as boolean,
  base: undefined as unknown as ParserExpression,
  check: undefined as unknown as ParserTypeExpression,
}) {
  constructor(props: MutableParserIsEx) {
    super(props);
  }
}

interface MutableParserNotEx {
  pos: Position;
  base: ParserExpression;
}
export class ParserNotEx extends Record<MutableParserNotEx>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserNotEx) {
    super(props);
  }
}

interface MutableParserOrEx {
  pos: Position;
  left: ParserExpression;
  right: ParserExpression;
}
export class ParserOrEx extends Record<MutableParserOrEx>({
  pos: undefined as unknown as Position,
  left: undefined as unknown as ParserExpression,
  right: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserOrEx) {
    super(props);
  }
}

interface MutableParserAndEx {
  pos: Position;
  left: ParserExpression;
  right: ParserExpression;
}
export class ParserAndEx extends Record<MutableParserAndEx>({
  pos: undefined as unknown as Position,
  left: undefined as unknown as ParserExpression,
  right: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserAndEx) {
    super(props);
  }
}

interface MutableParserAccessEx {
  pos: Position;
  base: ParserExpression;
  field: ParserIdentifierEx;
}
export class ParserAccessEx extends Record<MutableParserAccessEx>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as ParserExpression,
  field: undefined as unknown as ParserIdentifierEx,
}) {
  constructor(props: MutableParserAccessEx) {
    super(props);
  }
}

interface MutableParserStaticAccessEx {
  pos: Position;
  path: List<ParserIdentifierEx>;
}
export class ParserStaticAccessEx extends Record<MutableParserStaticAccessEx>({
  pos: undefined as unknown as Position,
  path: undefined as unknown as List<ParserIdentifierEx>,
}) {
  constructor(props: MutableParserStaticAccessEx) {
    super(props);
  }
}

interface MutableParserConstructEntry {
  pos: Position;
  name: string;
  value: ParserExpression;
}
export class ParserConstructEntry extends Record<MutableParserConstructEntry>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
  value: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserConstructEntry) {
    super(props);
  }
}

interface MutableParserConstructEx {
  pos: Position;
  base: ParserExpression;
  typeArgs: List<ParserTypeExpression>;
  fields: List<ParserConstructEntry>;
}
export class ParserConstructEx extends Record<MutableParserConstructEx>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as ParserExpression,
  typeArgs: undefined as unknown as List<ParserTypeExpression>,
  fields: undefined as unknown as List<ParserConstructEntry>,
}) {
  constructor(props: MutableParserConstructEx) {
    super(props);
  }
}

interface MutableParserParameter {
  pos: Position;
  name: string;
  phase: ExpressionPhase | undefined;
  type: ParserTypeExpression | undefined;
}
export class ParserParameter extends Record<MutableParserParameter>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
  phase: undefined as unknown as ExpressionPhase | undefined,
  type: undefined as unknown as ParserTypeExpression | undefined,
}) {
  constructor(props: MutableParserParameter) {
    super(props);
  }
}

interface MutableParserLambdaEx {
  pos: Position;
  functionPhase: FunctionPhase;
  params: List<ParserParameter>;
  body: ParserExpression;
}
export class ParserLambdaEx extends Record<MutableParserLambdaEx>({
  pos: undefined as unknown as Position,
  functionPhase: undefined as unknown as FunctionPhase,
  params: undefined as unknown as List<ParserParameter>,
  body: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserLambdaEx) {
    super(props);
  }
}

interface MutableParserBlockEx {
  pos: Position;
  body: List<ParserStatement>;
}
export class ParserBlockEx extends Record<MutableParserBlockEx>({
  pos: undefined as unknown as Position,
  body: undefined as unknown as List<ParserStatement>,
}) {
  constructor(props: MutableParserBlockEx) {
    super(props);
  }
}

interface MutableParserNoOpEx {
  pos: Position;
}
export class ParserNoOpEx extends Record<MutableParserNoOpEx>({
  pos: undefined as unknown as Position,
}) {
  constructor(props: MutableParserNoOpEx) {
    super(props);
  }
}

interface MutableParserExpressionStatement {
  pos: Position;
  expression: ParserExpression;
}
export class ParserExpressionStatement extends Record<MutableParserExpressionStatement>({
  pos: undefined as unknown as Position,
  expression: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserExpressionStatement) {
    super(props);
  }
}

interface MutableParserAssignmentStatement {
  pos: Position;
  name: string;
  phase: ExpressionPhase;
  type: ParserTypeExpression | undefined;
  expression: ParserExpression;
}
export class ParserAssignmentStatement extends Record<MutableParserAssignmentStatement>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
  phase: undefined as unknown as ExpressionPhase,
  type: undefined as unknown as ParserTypeExpression | undefined,
  expression: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserAssignmentStatement) {
    super(props);
  }
}

interface MutableParserReassignmentStatement {
  pos: Position;
  name: List<ParserIdentifierEx>;
  expression: ParserExpression;
}
export class ParserReassignmentStatement extends Record<MutableParserReassignmentStatement>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as List<ParserIdentifierEx>,
  expression: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserReassignmentStatement) {
    super(props);
  }
}

interface MutableParserFunctionStatement {
  pos: Position;
  phase: ExpressionPhase;
  name: string;
  typeParams: List<ParserTypeParameterType>;
  result: ParserTypeExpression;
  functionPhase: FunctionPhase;
  params: List<ParserParameter>;
  body: ParserExpression;
}
export class ParserFunctionStatement extends Record<MutableParserFunctionStatement>({
  pos: undefined as unknown as Position,
  phase: undefined as unknown as ExpressionPhase,
  name: undefined as unknown as string,
  typeParams: undefined as unknown as List<ParserTypeParameterType>,
  result: undefined as unknown as ParserTypeExpression,
  functionPhase: undefined as unknown as FunctionPhase,
  params: undefined as unknown as List<ParserParameter>,
  body: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserFunctionStatement) {
    super(props);
  }
}

interface MutableParserCallEx {
  pos: Position;
  func: ParserExpression;
  typeArgs: List<ParserTypeExpression>;
  args: List<ParserExpression>;
}
export class ParserCallEx extends Record<MutableParserCallEx>({
  pos: undefined as unknown as Position,
  func: undefined as unknown as ParserExpression,
  typeArgs: undefined as unknown as List<ParserTypeExpression>,
  args: undefined as unknown as List<ParserExpression>,
}) {
  constructor(props: MutableParserCallEx) {
    super(props);
  }
}

interface MutableParserIfEx {
  pos: Position;
  condition: ParserExpression;
  thenEx: ParserExpression;
  elseEx: ParserExpression | undefined;
}
export class ParserIfEx extends Record<MutableParserIfEx>({
  pos: undefined as unknown as Position,
  condition: undefined as unknown as ParserExpression,
  thenEx: undefined as unknown as ParserExpression,
  elseEx: undefined as unknown as ParserExpression | undefined,
}) {
  constructor(props: MutableParserIfEx) {
    super(props);
  }
}

interface MutableParserReturnEx {
  pos: Position;
  base: ParserExpression;
}
export class ParserReturnEx extends Record<MutableParserReturnEx>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserReturnEx) {
    super(props);
  }
}

interface MutableParserNominalImportExpression {
  pos: Position;
  name: string;
}
export class ParserNominalImportExpression extends Record<MutableParserNominalImportExpression>({
  pos: undefined as unknown as Position,
  name: undefined as unknown as string,
}) {
  constructor(props: MutableParserNominalImportExpression) {
    super(props);
  }
}

interface MutableParserNestedImportExpression {
  pos: Position;
  base: ParserNominalImportExpression;
  children: List<ParserImportExpression>;
}
export class ParserNestedImportExpression extends Record<MutableParserNestedImportExpression>({
  pos: undefined as unknown as Position,
  base: undefined as unknown as ParserNominalImportExpression,
  children: undefined as unknown as List<ParserImportExpression>,
}) {
  constructor(props: MutableParserNestedImportExpression) {
    super(props);
  }
}

interface MutableParserImportDeclaration {
  pos: Position;
  package: ParserNominalImportExpression;
  ex: ParserImportExpression;
}
export class ParserImportDeclaration extends Record<MutableParserImportDeclaration>({
  pos: undefined as unknown as Position,
  package: undefined as unknown as ParserNominalImportExpression,
  ex: undefined as unknown as ParserImportExpression,
}) {
  constructor(props: MutableParserImportDeclaration) {
    super(props);
  }
}

interface MutableParserFunctionDeclare {
  pos: Position;
  access: Access;
  extern: boolean;
  name: string;
  symbol: Symbol;
  typeParams: List<ParserTypeParameterType>;
  result: ParserTypeExpression;
  functionPhase: FunctionPhase;
  params: List<ParserParameter>;
  body: ParserExpression;
}
export class ParserFunctionDeclare extends Record<MutableParserFunctionDeclare>({
  pos: undefined as unknown as Position,
  access: undefined as unknown as Access,
  extern: undefined as unknown as boolean,
  name: undefined as unknown as string,
  symbol: undefined as unknown as Symbol,
  typeParams: undefined as unknown as List<ParserTypeParameterType>,
  result: undefined as unknown as ParserTypeExpression,
  functionPhase: undefined as unknown as FunctionPhase,
  params: undefined as unknown as List<ParserParameter>,
  body: undefined as unknown as ParserExpression,
}) {
  constructor(props: MutableParserFunctionDeclare) {
    super(props);
  }
}

interface MutableParserStructField {
  pos: Position;
  type: ParserTypeExpression;
  default: ParserExpression | undefined;
}
export class ParserStructField extends Record<MutableParserStructField>({
  pos: undefined as unknown as Position,
  type: undefined as unknown as ParserTypeExpression,
  default: undefined as unknown as ParserExpression | undefined,
}) {
  constructor(props: MutableParserStructField) {
    super(props);
  }
}

interface MutableParserStruct {
  pos: Position;
  symbol: Symbol;
  typeParams: List<ParserTypeParameterType>;
  fields: Map<string, ParserStructField>;
  enum: Symbol | undefined;
}
export class ParserStruct extends Record<MutableParserStruct>({
  pos: undefined as unknown as Position,
  symbol: undefined as unknown as Symbol,
  typeParams: undefined as unknown as List<ParserTypeParameterType>,
  fields: undefined as unknown as Map<string, ParserStructField>,
  enum: undefined as unknown as Symbol | undefined,
}) {
  constructor(props: MutableParserStruct) {
    super(props);
  }
}

interface MutableParserTuple {
  pos: Position;
  symbol: Symbol;
  typeParams: List<ParserTypeParameterType>;
  fields: List<ParserTypeExpression>;
  enum: Symbol | undefined;
}
export class ParserTuple extends Record<MutableParserTuple>({
  pos: undefined as unknown as Position,
  symbol: undefined as unknown as Symbol,
  typeParams: undefined as unknown as List<ParserTypeParameterType>,
  fields: undefined as unknown as List<ParserTypeExpression>,
  enum: undefined as unknown as Symbol | undefined,
}) {
  constructor(props: MutableParserTuple) {
    super(props);
  }
}

interface MutableParserAtom {
  pos: Position;
  symbol: Symbol;
  typeParams: List<ParserTypeParameterType>;
  enum: Symbol | undefined;
}
export class ParserAtom extends Record<MutableParserAtom>({
  pos: undefined as unknown as Position,
  symbol: undefined as unknown as Symbol,
  typeParams: undefined as unknown as List<ParserTypeParameterType>,
  enum: undefined as unknown as Symbol | undefined,
}) {
  constructor(props: MutableParserAtom) {
    super(props);
  }
}

interface MutableParserDataDeclare {
  pos: Position;
  access: Access;
  symbol: Symbol;
  name: string;
  typeParams: List<ParserTypeParameterType>;
  layout: ParserDataLayout;
}
export class ParserDataDeclare extends Record<MutableParserDataDeclare>({
  pos: undefined as unknown as Position,
  access: undefined as unknown as Access,
  symbol: undefined as unknown as Symbol,
  name: undefined as unknown as string,
  typeParams: undefined as unknown as List<ParserTypeParameterType>,
  layout: undefined as unknown as ParserDataLayout,
}) {
  constructor(props: MutableParserDataDeclare) {
    super(props);
  }
}

interface MutableParserEnumDeclare {
  pos: Position;
  access: Access;
  symbol: Symbol;
  name: string;
  typeParams: List<ParserTypeParameterType>;
  variants: Map<string, ParserDataLayout>;
}
export class ParserEnumDeclare extends Record<MutableParserEnumDeclare>({
  pos: undefined as unknown as Position,
  access: undefined as unknown as Access,
  symbol: undefined as unknown as Symbol,
  name: undefined as unknown as string,
  typeParams: undefined as unknown as List<ParserTypeParameterType>,
  variants: undefined as unknown as Map<string, ParserDataLayout>,
}) {
  constructor(props: MutableParserEnumDeclare) {
    super(props);
  }
}

interface MutableParserConstantDeclare {
  pos: Position;
  access: Access;
  symbol: Symbol;
  name: string;
  expression: ParserExpression;
  type: ParserTypeExpression;
}
export class ParserConstantDeclare extends Record<MutableParserConstantDeclare>({
  pos: undefined as unknown as Position,
  access: undefined as unknown as Access,
  symbol: undefined as unknown as Symbol,
  name: undefined as unknown as string,
  expression: undefined as unknown as ParserExpression,
  type: undefined as unknown as ParserTypeExpression,
}) {
  constructor(props: MutableParserConstantDeclare) {
    super(props);
  }
}

interface MutableParserImplDeclare {
  pos: Position;
  symbol: Symbol;
  typeParams: List<ParserTypeParameterType>;
  base: ParserConcreteType;
  methods: Map<string, ParserFunctionDeclare>;
}
export class ParserImplDeclare extends Record<MutableParserImplDeclare>({
  pos: undefined as unknown as Position,
  symbol: undefined as unknown as Symbol,
  typeParams: undefined as unknown as List<ParserTypeParameterType>,
  base: undefined as unknown as ParserConcreteType,
  methods: undefined as unknown as Map<string, ParserFunctionDeclare>,
}) {
  constructor(props: MutableParserImplDeclare) {
    super(props);
  }
}

interface MutableParserFile {
  src: string;
  module: Symbol;
  declarations: List<ParserDeclaration>;
}
export class ParserFile extends Record<MutableParserFile>({
  src: undefined as unknown as string,
  module: undefined as unknown as Symbol,
  declarations: undefined as unknown as List<ParserDeclaration>,
}) {
  constructor(props: MutableParserFile) {
    super(props);
  }
}

