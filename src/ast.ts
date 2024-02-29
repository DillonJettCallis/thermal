import { Set } from 'immutable';

export class Position {
  constructor(readonly src: string, readonly line: number, readonly column: number) {
  }

  fail(message: string): never {
    throw new Error(`${message} at ${this.src} ${this.line}:${this.column}`);
  }
}

export type Expression
  = BooleanLiteralEx
  | StringLiteralEx
  | NumberLiteralEx
  | IdentifierEx
  | IsExpression
  | AccessExpression
  | StaticAccessExpression
  | ConstructExpression
  | LambdaEx
  | BlockEx
  | CallEx
  | IfEx
  | ReturnEx
  ;

export interface BooleanLiteralEx {
  pos: Position;
  kind: 'booleanLiteral';
  value: boolean;
}

export interface StringLiteralEx {
  pos: Position;
  kind: 'stringLiteral';
  value: string;
}

export interface NumberLiteralEx {
  pos: Position;
  kind: 'numberLiteral';
  value: string;
}

export interface IdentifierEx {
  pos: Position;
  kind: 'identifier';
  name: string;
}

export interface IsExpression {
  pos: Position;
  kind: 'is';
  not: boolean;
  base: Expression;
  type: TypeExpression;
}

export interface AccessExpression {
  pos: Position;
  kind: 'access';
  base: Expression;
  field: IdentifierEx;
}

export interface StaticAccessExpression {
  pos: Position;
  kind: 'staticAccess';
  path: IdentifierEx[];
}

export interface ConstructExpression {
  pos: Position;
  kind: 'construct';
  base: Expression;
  fields: Array<{ name: string, value: Expression }>;
}

export interface LambdaEx {
  pos: Position;
  kind: 'function';
  params: Parameter[];
  body: Expression;
}

export interface BlockEx {
  pos: Position;
  kind: 'block';
  body: Statement[];
}

export interface CallEx {
  pos: Position;
  kind: 'call';
  func: Expression;
  typeArgs: TypeExpression[] | undefined;
  args: Expression[];
}

export interface IfEx {
  pos: Position;
  kind: 'if';
  condition: Expression;
  thenEx: Expression;
  elseEx: Expression | undefined;
}

export interface ReturnEx {
  pos: Position;
  kind: 'return';
  expression: Expression;
}

export type Statement
  = ExpressionStatement
  | AssignmentStatement
  | FunctionStatement
  ;

export interface ExpressionStatement {
  kind: 'expression';
  pos: Position;
  expression: Expression;
}

export interface AssignmentStatement {
  kind: 'assignment';
  pos: Position;
  name: string;
  phase: Phase;
  type: TypeExpression | undefined;
  expression: Expression;
}

export interface FunctionStatement extends LambdaEx {
  kind: 'function';
  name: string;
  typeParams: TypeParameter[];
  resultType: ResultType;
}

export type Declaration
  = FunctionDeclaration
  | StructDeclaration
  | ConstantDeclaration
  | EnumDeclaration
  ;

export interface FunctionDeclaration extends FunctionStatement {
  access: Access;
}

export interface StructDeclaration {
  pos: Position;
  access: Access;
  name: string;
  typeParams: TypeParameter[];
  fields: { [key: string]: TypeExpression };
}

export interface EnumDeclaration {
  pos: Position;
  access: Access;
  name: string;
  typeParams: TypeParameter[];
  variants: { [key: string]: EnumVariant };
}

export type EnumVariant
  = EnumStructVariant
  | EnumTupleVariant
  | EnumNominalVariant
  ;

export interface EnumStructVariant {
  kind: 'struct';
  fields: { [key: string]: TypeParameter };
}

export interface EnumTupleVariant {
  kind: 'tuple';
  fields: TypeParameter[];
}

export interface EnumNominalVariant {
  kind: 'nominal';
  type: TypeExpression;
}

export interface ConstantDeclaration {
  pos: Position;
  access: Access;
  name: string;
  expression: Expression;
}

export type Access
  = 'private'
  | 'protected'
  | 'internal'
  | 'public'
  ;

const accessKeywords = Set(['private', 'protected', 'internal', 'public']);

export function isAccess(key: string): key is Access {
  return accessKeywords.has(key);
}

export interface File {
  src: string;
  declarations: Declaration[];
}

export interface Module {
  name: ModuleName;
  files: File[];
}

export interface Program {
  main: File[];
  libs: Module[];
}

export interface ModuleName {
  organization: string;
  name: string;
  version: Version;
}

export interface Version {
  major: number;
  minor: number;
  patch: number;
  build: number | undefined; // if you want to specify a build number, like, a single number that goes up for every nightly build with no other logic
  channel: string | undefined; // for something like 'beta', 'rc' or 'nightly'
  variant: string | undefined; // if you have different versions, say, for specific systems like 'win' vs 'nix' if you have native code
}

export interface TypeParameter {
  pos: Position;
  name: string;
  bound: TypeBound | undefined;
}

export interface Parameter {
  pos: Position;
  name: string;
  phase: Phase | undefined;
  type: TypeExpression | undefined;
}

export interface TypeBound {
  constraint: Bound;
  type: TypeExpression;
}

export type Bound
  = 'covariant'
  | 'invariant'
  | 'contravariant'
  ;

export interface ResultType {
  phase: Phase | undefined;
  type: TypeExpression;
}

export type TypeExpression
  = NominalType
  | ParameterizedType
  | FunctionType
  ;

export interface NominalType {
  pos: Position;
  kind: 'nominal';
  name: string;
}

export interface ParameterizedType {
  pos: Position;
  kind: 'parameterized';
  base: NominalType;
  args: TypeExpression[];
}

export interface FunctionType {
  pos: Position;
  kind: 'function';
  params: TypeExpression[],
  result: ResultType;
}

export type Phase
  = 'const'
  | 'val'
  | 'var'
  | 'def'
  | 'sig'
  ;

const phaseKeywords = Set(['const', 'val', 'var', 'def', 'sig']);

export function isPhase(key: string): key is Phase {
  return phaseKeywords.has(key);
}
