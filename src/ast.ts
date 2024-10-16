import { List, Map, Record, Seq, Set } from 'immutable';

export class Position {
  constructor(readonly src: string, readonly line: number, readonly column: number) {
  }

  describe(): string {
    return `${this.src} ${this.line}:${this.column}`
  }

  fail(message: string): never {
    throw new Error(`${message} at ${this.describe()}`);
  }
}

export type CheckedTypeExpression<Ex extends UncheckedTypeExpression>
  = Ex extends UncheckedNominalType ? NominalType
  : Ex extends UncheckedTypeParameterType ? TypeParameterType
  : Ex extends UncheckedParameterizedType ? ParameterizedType
  : Ex extends UncheckedFunctionType ? FunctionType
  : Ex extends UncheckedOverloadFunctionType ? OverloadFunctionType
  : never
  ;

export type Typed<Ex extends Expression> = {
  [Key in keyof Ex]
    : Ex[Key] extends Expression ? Typed<Ex[Key]>
    : Ex[Key] extends (infer Item extends Expression) | undefined ? Typed<Item> | undefined
    : Ex[Key] extends Array<infer Item extends Expression> ? Array<Typed<Item>>
    : Ex[Key] extends Array<{key: infer KeyType extends Expression, value: infer ValueType extends Expression}> ? Array<{key: Typed<KeyType>, value: Typed<ValueType>}>
    : Ex[Key] extends Array<ConstructFieldExpression> ? Array<TypedConstructFieldExpression>
    : Ex[Key] extends UncheckedTypeExpression ? CheckedTypeExpression<Ex[Key]>
    : Ex[Key] extends Array<UncheckedParameter> ? Array<Parameter> // this is for function params
    : Ex[Key] extends Array<UncheckedTypeExpression> | undefined ? Array<TypeExpression> // this is to handle CallEx
    : Ex[Key] extends Array<Statement> | undefined ? Array<TypedStatement<Statement>> // this is for blocks
    : Ex[Key]
} & { type: TypeExpression };

export type TypedStatement<State extends Statement> = {
  [Key in keyof State]
    : State[Key] extends Expression ? Typed<State[Key]>
    : State[Key] extends UncheckedTypeExpression | undefined ? TypeExpression
    : State[Key] extends Array<UncheckedParameter> ? Array<Parameter> // this is for function params
    : State[Key] extends Array<UncheckedTypeExpression> ? Array<TypeExpression> // this is for function type params
    : State[Key]
} & { type: TypeExpression };

export type Expression
  = BooleanLiteralEx
  | StringLiteralEx
  | IntLiteralEx
  | FloatLiteralEx
  | IdentifierEx
  | ListLiteralEx
  | SetLiteralEx
  | MapLiteralEx
  | IsExpression
  | NotExpression
  | OrExpression
  | AndExpression
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

export interface IntLiteralEx {
  pos: Position;
  kind: 'intLiteral';
  value: number;
}

export interface FloatLiteralEx {
  pos: Position;
  kind: 'floatLiteral';
  value: number;
}

export interface IdentifierEx {
  pos: Position;
  kind: 'identifier';
  name: string;
}

export interface ListLiteralEx {
  pos: Position;
  kind: 'list';
  values: Expression[];
}

export interface SetLiteralEx {
  pos: Position;
  kind: 'set';
  values: Expression[];
}

export interface MapLiteralEx {
  pos: Position;
  kind: 'map';
  values: {key: Expression, value: Expression}[];
}

export interface IsExpression {
  pos: Position;
  kind: 'is';
  not: boolean;
  base: Expression;
  check: UncheckedTypeExpression;
}

export interface NotExpression {
  pos: Position;
  kind: 'not';
  base: Expression;
}

export interface OrExpression {
  pos: Position;
  kind: 'or';
  left: Expression;
  right: Expression;
}

export interface AndExpression {
  pos: Position;
  kind: 'and';
  left: Expression;
  right: Expression;
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
  fields: Array<ConstructFieldExpression>;
}

export interface ConstructFieldExpression {
  pos: Position;
  name: string;
  value: Expression;
}

export interface TypedConstructFieldExpression {
  pos: Position;
  name: string;
  value: Typed<Expression>;
}

export interface LambdaEx {
  pos: Position;
  kind: 'function';
  phase: FunctionPhase;
  params: UncheckedParameter[];
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
  typeArgs: UncheckedTypeExpression[] | undefined;
  args: Expression[];
}

export interface IfEx {
  pos: Position;
  kind: 'if';
  condition: Expression;
  thenEx: Expression;
  elseEx: Expression | undefined;
}

// TODO: match expressions haven't been implemented yet
export interface MatchEx {
  pos: Position;
  kind: 'match',
  condition: Expression;
  patterns: MatchCase[];
}

export interface MatchCase {
  pos: Position;
  test: Expression | undefined;
  pattern: MatchPattern | undefined;
}

export type MatchPattern
  = MatchBind
  | MatchStruct
  | MatchTuple
  | MatchValue
  ;

export interface MatchBind {
  pos: Position;
  kind: 'bind';
  name: string;
}

export interface MatchStruct {
  pos: Position;
  kind: 'struct';
  base: UncheckedTypeExpression;
  fields: { [key: string]: MatchPattern };
}

export interface MatchTuple {
  pos: Position;
  kind: 'tuple';
  base: UncheckedTypeExpression;
  fields: MatchPattern[];
}

export interface MatchValue {
  pos: Position;
  kind: 'value';
  value: Expression;
}

export interface ReturnEx {
  pos: Position;
  kind: 'return';
  expression: Expression;
}

export type Statement
  = ExpressionStatement
  | AssignmentStatement
  | ReassignmentStatement
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
  phase: ExpressionPhase;
  type: UncheckedTypeExpression | undefined;
  expression: Expression;
}

export interface ReassignmentStatement {
  kind: 'reassignment';
  pos: Position;
  name: string;
  expression: Expression;
}

export interface FunctionStatement extends LambdaEx {
  kind: 'function';
  name: string;
  typeParams: UncheckedTypeParameterType[];
  resultType: UncheckedTypeExpression;
}

export type Declaration
  = ImportDeclaration
  | FunctionDeclaration
  | StructDeclaration
  | ConstantDeclaration
  | EnumDeclaration
  ;

export interface ImportDeclaration {
  pos: Position;
  kind: 'import';
  package: NominalImportExpression;
  ex: ImportExpression;
}

export type ImportExpression
  = NominalImportExpression
  | NestedImportExpression
  ;

export interface NominalImportExpression {
  pos: Position;
  kind: 'nominal';
  name: string;
}

export interface NestedImportExpression {
  pos: Position;
  kind: 'nested';
  base: NominalImportExpression;
  children: ImportExpression[];
}

export interface FunctionDeclaration extends FunctionStatement {
  extern: boolean;
  access: Access;
  symbol: Symbol;
}

export interface StructDeclaration {
  pos: Position;
  kind: 'struct';
  access: Access;
  symbol: Symbol;
  name: string;
  typeParams: UncheckedTypeParameterType[];
  fields: Map<string, StructField>;
}

export interface EnumDeclaration {
  pos: Position;
  kind: 'enum';
  access: Access;
  symbol: Symbol;
  name: string;
  typeParams: UncheckedTypeParameterType[];
  variants: Map<string, EnumVariant>;
}

export type EnumVariant
  = EnumStructVariant
  | EnumTupleVariant
  | EnumAtomVariant
  ;

export interface EnumStructVariant {
  pos: Position;
  kind: 'struct';
  symbol: Symbol;
  fields: Map<string, StructField>;
}

export interface StructField {
  type: UncheckedTypeExpression;
  default: Expression | undefined;
}

export interface EnumTupleVariant {
  pos: Position;
  kind: 'tuple';
  symbol: Symbol;
  fields: UncheckedTypeExpression[];
}

export interface EnumAtomVariant {
  pos: Position;
  kind: 'atom';
  symbol: Symbol;
}

export interface ConstantDeclaration {
  pos: Position;
  kind: 'const';
  access: Access;
  symbol: Symbol;
  name: string;
  expression: Expression;
  type: UncheckedTypeExpression;
}

export type Access
  = 'private' // within the same file
  | 'protected' // within the same file, neighboring files, or inside directories that are neighbors
  | 'package' // within the same package
  | 'internal' // within the same assembly (this is the default and in fact cannot be specified)
  | 'public' // globally, available to anyone
  ;

const accessKeywords = Set(['private', 'protected', 'package', 'internal', 'public']);

export function isAccess(key: string): key is Access {
  return accessKeywords.has(key);
}

export interface File {
  src: string;
  module: Symbol;
  declarations: Declaration[];
}

export interface Package {
  name: PackageName;
  files: File[];
  declarations: Map<Symbol, AccessRecord>;
}

export interface StructType {
  pos: Position;
  kind: 'struct';
  name: Symbol;
  typeParams: TypeParameterType[];
  fields: Map<string, TypeExpression>;
}

export interface EnumType {
  pos: Position;
  kind: 'enum';
  name: Symbol;
  typeParams: TypeParameterType[];
  variants: Map<string, EnumTypeVariant>;
}

export type EnumTypeVariant
  = EnumTypeStructVariant
  | EnumTypeTupleVariant
  | EnumTypeAtomVariant
  ;

export interface EnumTypeStructVariant {
  pos: Position;
  kind: 'enumStruct';
  name: Symbol;
  fields: Map<string, TypeExpression>;
}

export interface EnumTypeTupleVariant {
  pos: Position;
  kind: 'enumTuple';
  name: Symbol;
  fields: TypeExpression[];
}

export interface EnumTypeAtomVariant {
  pos: Position;
  kind: 'enumAtom';
  name: Symbol;
}

export interface Program {
  main: Package;
  libs: Package[];
}

export class Version extends Record({
  major: 0,
  minor: 0,
  patch: 0,
  build: undefined as number | undefined, // if you want to specify a build number, like, a single number that goes up for every nightly build with no other logic
  channel: undefined as string | undefined, // for something like 'beta', 'rc' or 'nightly'
  variant: undefined as string | undefined, // if you have different versions, say, for specific systems like 'win' vs 'nix' if you have native code
}) {
  constructor(major: number, minor: number, patch: number, { build, channel, variant }: { build?: number, channel?: string, variant?: string } = {}) {
    super({major, minor, patch, build, channel, variant});
  }

  override toString(): string {
    return [
      this.major,
      this.minor,
      this.patch,
      this.build,
      this.channel,
      this.variant,
    ].filter(it => it != null)
      .join('-');
  }
}

export class PackageName extends Record({
  organization: undefined as unknown as string,
  assembly: undefined as string | undefined,
  name: undefined as unknown as string,
  alias: undefined as string | undefined,
  version: undefined as unknown as Version,
}) {
  constructor(organization: string, name: string, version: Version, assembly?: string, alias?: string) {
    if (name === 'self') {
      throw new Error(`Package name 'self' is forbidden`);
    }

    super({ organization, assembly, name, version, alias });
  }

  override toString(): string {
    return `${this.organization}/${this.name}/${this.version}`
  }
}

export class Symbol extends Record({
  package: undefined as unknown as PackageName,
  path: List<string>(),
}) {
  constructor(pack: PackageName) {
    super({ package: pack, path: List() });
  }

  child(next: string): Symbol {
    return this.update("path", path => path.push(next));
  }

  parent(): Symbol | undefined {
    if (this.path.isEmpty()) {
      return undefined;
    } else {
      return this.set("path", this.path.pop());
    }
  }

  isParent(other: Symbol): boolean {
    return this.package.equals(other.package) && this.path.equals(other.path.take(this.path.size));
  }

  get name(): string {
    return this.path.last();
  }

  override toString(): string {
    if (this.path.isEmpty()) {
      return this.package.toString();
    } else {
      return `${this.package}/${this.path.join('::')}`;
    }
  }
}

export class DependencyManager {
  // map of an alias to it's full package name
  #packages = Map<string, PackageName>().asMutable();

  constructor(self: PackageName) {
    this.#packages.set('self', self);
  }


  /**
   * Add this package with this alias, or `package.name` if alias is undefined.
   * @param packageName
   * @param alias
   */
  addDependency(packageName: PackageName, alias?: string): void {
    if (alias === 'self') {
      throw new Error(`Alias 'self' is forbidden`);
    }

    this.#packages.set(alias ?? packageName.name, packageName);
  }

  /**
   * Find the full PackageName for this string name or alias.
   *
   * Return undefined if not found.
   * @param packageName
   */
  resolveImportPackage(packageName: string): PackageName | undefined {
    return this.#packages.get(packageName);
  }

  breakdownImport(importDec: ImportDeclaration): Symbol[] {
    return this.#breakdownImportExpression(new Symbol(this.resolveImportPackage(importDec.package.name) ?? importDec.pos.fail(`No dependency with name or alias '${importDec.package.name}' was found`)), importDec.ex);
  }

  #breakdownImportExpression(parent: Symbol, importEx: ImportExpression): Symbol[] {
    switch (importEx.kind) {
      case "nominal":
        return [this.#breakdownNominalImportExpression(parent, importEx)];
      case "nested":
        return this.#breakdownNestedImportExpression(parent, importEx)
    }
  }

  #breakdownNominalImportExpression(parent: Symbol, importEx: NominalImportExpression): Symbol {
    return parent.child(importEx.name);
  }

  #breakdownNestedImportExpression(parent: Symbol, importEx: NestedImportExpression): Symbol[] {
    const base = this.#breakdownNominalImportExpression(parent, importEx.base);

    return importEx.children.flatMap(it => this.#breakdownImportExpression(base, it));
  }
}

export class DependencyDictionary {
  // for every library, this holds the manager for it, which in turn lists all of that dependency's dependencies
  #managers = Map<PackageName, DependencyManager>().asMutable();

  /**
   * Return a new (mutable) DependencyManager, store it internally and return it
   *
   * If this package already exists it is replaced with a new one.
   * @param packageName
   */
  addManager(packageName: PackageName): DependencyManager {
    const newManager = new DependencyManager(packageName);
    this.#managers.set(packageName, newManager);
    return newManager;
  }

  /**
   * Get the dependency manager for a package, or undefined if it was not found
   * @param packageName
   */
  getManager(packageName: PackageName): DependencyManager | undefined {
    return this.#managers.get(packageName);
  }
}

export interface UncheckedParameter {
  pos: Position;
  name: string;
  phase: ExpressionPhase | undefined;
  type: UncheckedTypeExpression | undefined;
}

export interface Parameter {
  pos: Position;
  name: string;
  phase: ExpressionPhase | undefined;
  type: TypeExpression;
}

export type UncheckedTypeExpression
  = UncheckedNominalType
  | UncheckedParameterizedType
  | UncheckedFunctionType
  | UncheckedTypeParameterType
  | UncheckedOverloadFunctionType
  ;

export interface UncheckedNominalType {
  pos: Position;
  kind: 'nominal';
  name: IdentifierEx[];
}

export interface UncheckedParameterizedType {
  pos: Position;
  kind: 'parameterized';
  base: UncheckedNominalType;
  args: UncheckedTypeExpression[];
}

// this is only used in higher-order functions or fields, neither of which are allowed to define typeParams!
export interface UncheckedFunctionType {
  pos: Position;
  kind: 'function';
  phase: FunctionPhase;
  params: UncheckedFunctionTypeParameter[],
  result: UncheckedTypeExpression;
}

export interface UncheckedTypeParameterType {
  pos: Position;
  kind: 'typeParameter';
  name: string;
}

export interface UncheckedOverloadFunctionType {
  pos: Position;
  kind: 'overloadFunction';
  branches: UncheckedFunctionType[];
}

export interface UncheckedFunctionTypeParameter {
  pos: Position;
  phase: ExpressionPhase | undefined;
  type: UncheckedTypeExpression;
}

export type ExpressionPhase
  = 'const'
  | 'val'
  | 'var'
  | 'dyn'
  ;

export type FunctionPhase
  = 'fun'
  | 'def'
  | 'sig'
  ;

const expressionPhaseKeywords = Set(['const', 'val', 'var', 'dyn']);

export function isExpressionPhase(key: string): key is ExpressionPhase {
  return expressionPhaseKeywords.has(key);
}

const functionPhaseKeywords = Set(['fun', 'def', 'sig']);

export function isFunctionPhase(key: string): key is FunctionPhase {
  return functionPhaseKeywords.has(key);
}


export function typesEqual(left: TypeExpression | undefined, right: TypeExpression | undefined): boolean {
  if (left === right) {
    return true;
  }

  if (left === undefined || right === undefined) {
    return false;
  }

  if (left.kind === 'nominal' && right.kind === 'nominal' && left.name.equals(right.name)) {
    return true;
  }

  if (left.kind === 'parameterized' && right.kind === 'parameterized' && left.base.name.equals(right.base.name) && left.args.length === right.args.length) {
    return Seq(left.args).zipWith(typesEqual, Seq(right.args)).every(it => it);
  }

  if (left.kind === 'function' && right.kind === 'function' && typesEqual(left.result, right.result) && left.params.length === right.params.length) {
    return Seq(left.params).map(it => it.type).zipWith(typesEqual, Seq(right.params).map(it => it.type)).every(it => it);
  }

  if (left.kind === 'overloadFunction' && right.kind === 'overloadFunction') {
    return Seq(left.branches).zipWith(typesEqual, Seq(right.branches)).every(it => it);
  }

  if (left.kind === 'module' && right.kind === 'module') {
    return left.name.equals(right.name);
  }

  if (left.kind === 'struct' && right.kind === 'struct') {
    return left.name.equals(right.name);
  }

  if (left.kind === 'enum' && right.kind === 'enum') {
    return left.name.equals(right.name);
  }

  if (left.kind === 'enumStruct' && right.kind === 'enumStruct') {
    return left.name.equals(right.name);
  }

  if (left.kind === 'enumTuple' && right.kind === 'enumTuple') {
    return left.name.equals(right.name);
  }

  if (left.kind === 'enumAtom' && right.kind === 'enumAtom') {
    return left.name.equals(right.name);
  }

  return false;
}

export type TypeExpression
  = NominalType
  | TypeParameterType
  | ParameterizedType
  | FunctionType
  | OverloadFunctionType
  | ModuleType
  | StructType
  | EnumType
  | EnumTypeVariant
  ;

export interface NominalType {
  pos: Position;
  kind: 'nominal';
  name: Symbol;
}

export interface TypeParameterType {
  pos: Position;
  kind: 'typeParameter';
  name: Symbol;
  // TODO: someday we'll have type bounds and this is where they'll be declared
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
  phase: FunctionPhase;
  typeParams: TypeParameterType[],
  params: FunctionTypeParameter[],
  result: TypeExpression;
}

export interface OverloadFunctionType {
  pos: Position;
  kind: 'overloadFunction';
  branches: FunctionType[];
}

export interface ModuleType {
  pos: Position;
  kind: 'module';
  name: Symbol;
}

export interface FunctionTypeParameter {
  pos: Position;
  phase: ExpressionPhase | undefined;
  type: TypeExpression;
}

export interface AccessRecord {
  access: Access;
  module: Symbol;
  type: TypeExpression;
}
