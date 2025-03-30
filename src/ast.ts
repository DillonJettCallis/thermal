import { List, Map, Record, Set } from 'immutable';
import {
  ParserIdentifierEx,
  type ParserImportDeclaration,
  type ParserNestedImportExpression
} from './parser/parserAst.ts';
import { type ParserImportExpression, ParserNominalImportExpression } from './parser/parserAst.ts';
import {
  CheckedAccessRecord,
  type CheckedImportDeclaration,
  type CheckedImportExpression,
  CheckedNestedImportExpression,
  CheckedNominalImportExpression, CheckedProtocolType, type CheckedTypeExpression
} from './checker/checkerAst.ts';

export class Position extends Record({src: '', line: 0, column: 0}){
  public static readonly native = new Position('[native]', 0, 0);

  constructor(src: string, line: number, column: number) {
    super({src, line, column});
  }

  describe(): string {
    return `${this.src} ${this.line}:${this.column}`;
  }

  fail(message: string): never {
    throw new Error(`${message} at ${this.describe()}`);
  }
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
      throw new Error('Package name \'self\' is forbidden');
    }

    super({ organization, assembly, name, version, alias });
  }

  override toString(): string {
    return `${this.organization}/${this.name}/${this.version}`;
  }
}

export class Symbol extends Record({
  package: undefined as unknown as PackageName,
  path: List<string>(),
}) {
  constructor(pack: PackageName) {
    super({ package: pack, path: List() });
  }

  child(next: string): this {
    return this.update('path', path => path.push(next));
  }

  parent(): this | undefined {
    if (this.path.isEmpty()) {
      return undefined;
    } else {
      return this.set('path', this.path.pop());
    }
  }

  isParent(other: Symbol): boolean {
    return this.package.equals(other.package) && this.path.equals(other.path.take(this.path.size));
  }

  get name(): string {
    return this.path.last()!;
  }

  serializedName(): string {
    return this.path.filter(it => it.match(/^\w+$/))
      .join('_');
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
      throw new Error('Alias \'self\' is forbidden');
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

  breakdownImport(importDec: ParserImportDeclaration | CheckedImportDeclaration): List<Symbol> {
    return this.#breakdownImportExpression(new Symbol(this.resolveImportPackage(importDec.package.name) ?? importDec.pos.fail(`No dependency with name or alias '${importDec.package.name}' was found`)), importDec.ex);
  }

  #breakdownImportExpression(parent: Symbol, importEx: ParserImportExpression | CheckedImportExpression): List<Symbol> {
    if (importEx instanceof ParserNominalImportExpression || importEx instanceof CheckedNominalImportExpression) {
      return List.of(this.#breakdownNominalImportExpression(parent, importEx));
    } else {
      return this.#breakdownNestedImportExpression(parent, importEx);
    }
  }

  #breakdownNominalImportExpression(parent: Symbol, importEx: ParserNominalImportExpression | CheckedNominalImportExpression): Symbol {
    return parent.child(importEx.name);
  }

  #breakdownNestedImportExpression(parent: Symbol, importEx: ParserNestedImportExpression | CheckedNestedImportExpression): List<Symbol> {
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

export interface Package {
  /**
   * The name of this package
   */
  readonly name: PackageName;

  /**
   * every single declared symbol in the entire system - every struct, enum top level function, all of it.
   * this only excludes things like enum variants, generics, inner functions and other stuff not defined at the top level of a file
   **/
  readonly symbols: Map<Symbol, CheckedAccessRecord>;

  /**
   * Every single method in the system, keyed by the symbol of the base type
   */
  readonly methods: Map<Symbol, Map<string, CheckedAccessRecord>>;

  /**
   * Map of every base type to every protocol to that implementation, which can itself be found as a key in `methods`
   */
  readonly protocolImpls: Map<Symbol, Map<Symbol, Symbol>>;

  /**
   * Externals for this package
   */
  readonly externals: Map<Symbol, Extern>;
}

export class PackageBuilder {

  /**
   * The name of this package
   */
  readonly #name: PackageName;

  /**
   * every single declared symbol in the entire system - every struct, enum top level function, all of it.
   * this only excludes things like enum variants, generics, inner functions and other stuff not defined at the top level of a file
   **/
  readonly #symbols = Map<Symbol, CheckedAccessRecord>().asMutable();

  /**
   * Every single method in the system, keyed by the symbol of the base type
   */
  readonly #methods = Map<Symbol, Map<string, CheckedAccessRecord>>().asMutable();

  /**
   * Map of every base type to every protocol to that implementation, which can itself be found as a key in `methods`
   */
  readonly #protocolImpls = Map<Symbol, Map<Symbol, Symbol>>().asMutable();

  /**
   * Externals for this package
   */
  readonly #externals = Map<Symbol, Extern>().asMutable();

  constructor(name: PackageName) {
    this.#name = name;
  }

  get name(): PackageName {
    return this.#name;
  }

  declare(symbol: Symbol, record: CheckedAccessRecord): void {
    this.#symbols.set(symbol, record);
  }

  method(symbol: Symbol, name: string, record: CheckedAccessRecord): void {
    // the fully static version of the method
    this.declare(symbol.child(name), record);
    // the method lookup
    this.#methods.update(symbol, prev => (prev ?? Map<string, CheckedAccessRecord>().asMutable()).set(name, record));
  }

  protocolImpl(impl: Symbol, base: Symbol, proto: Symbol, name: string, record: CheckedAccessRecord): void {
    // the method lookup of this specific impl
    this.method(impl, name, record);
    // point the base to proto at the impl
    this.#protocolImpls.update(base, prev => (prev ?? Map<Symbol, Symbol>().asMutable()).set(proto, impl));
  }

  external(symbol: Symbol, extern: Extern): void {
    this.#externals.set(symbol, extern);
  }

  build(): Package {
    return {
      name: this.name,
      symbols: this.#symbols.asImmutable(),
      methods: this.#methods.map(it => it.asImmutable()).asImmutable(),
      protocolImpls: this.#protocolImpls.asImmutable(),
      externals: this.#externals.asImmutable(),
    };
  }
}

export class TypeDictionary {
  /**
   * every single declared symbol in the entire system - every struct, enum top level function, all of it.
   * this only excludes things like enum variants, generics, inner functions and other stuff not defined at the top level of a file
   **/
  readonly #symbols = Map<Symbol, CheckedAccessRecord>().asMutable();
  /**
   * Every single method in the system, keyed by the symbol of the base type
   */
  readonly #methods = Map<Symbol, Map<string, CheckedAccessRecord>>().asMutable();

  /**
   * Map of every base type to every protocol to that implementation, which can itself be found as a key in `methods`
   */
  readonly #protocolImpls = Map<Symbol, Map<Symbol, Symbol>>().asMutable();

  /**
   * Externals for this package
   */
  readonly #externals = Map<Symbol, Extern>().asMutable();

  constructor(coreDeclarations: Map<Symbol, CheckedAccessRecord>) {
    this.#symbols.merge(coreDeclarations);
  }

  get symbols(): Map<Symbol, CheckedAccessRecord> {
    return this.#symbols;
  }

  get methods(): Map<Symbol, Map<string, CheckedAccessRecord>> {
    return this.#methods;
  }

  loadPackage(pack: Package): void {
    this.#symbols.merge(pack.symbols);
    this.#methods.merge(pack.methods);
    this.#protocolImpls.merge(pack.protocolImpls);
    this.#externals.merge(pack.externals);
  }

  lookupSymbol(symbol: Symbol): CheckedAccessRecord | undefined {
    return this.#symbols.get(symbol);
  }

  // TODO: consider what protocols are in scope at this point
  lookupMethod(base: Symbol, id: ParserIdentifierEx, protocols: Set<Symbol>): CheckedAccessRecord | undefined {
    const protoImpls = this.#protocolImpls.get(base) ?? Map<Symbol, Symbol>();

    const methods = protocols.map(it => protoImpls.get(it)).filter(it => it !== undefined)
      .add(base)
      .map(it => this.#methods.get(it)?.get(id.name))
      .filter(it => it !== undefined);

    if (methods.size === 0) {
      return undefined;
    } else if (methods.size === 1) {
      return methods.first()!;
    } else {
      id.pos.fail(`More than one implementation of ${id.name} found`);
    }
  }

  lookupExternal(base: Symbol): Extern | undefined {
    return this.#externals.get(base);
  }

  /**
   * Return the module that this symbol belongs to by looking up it's parent chain to find a module
   *
   * Can return itself if the given item is a module.
   *
   * Returns undefined if none was found (likely this is a bug)
   */
  lookupModule(name: Symbol): Symbol | undefined {
    return this.#symbols.get(name)?.module;
  }

  /**
   * is this a protocol? True if it is, false if not or if not found
   */
  isProtocol(name: Symbol): boolean {
    return this.lookupSymbol(name)?.type instanceof CheckedProtocolType;
  }
}

export class Extern extends Record({
  symbol: undefined as unknown as Symbol,
  // TODO: replace this with target-specifics
  srcFile: '',
  import: '',
}) {
}

export class PhaseType extends Record({
  type: undefined as unknown as CheckedTypeExpression,
  phase: undefined as unknown as ExpressionPhase,
  pos: undefined as unknown as Position,
}) {
  constructor(type: CheckedTypeExpression, phase: ExpressionPhase, pos: Position) {
    super({type, phase, pos});
  }
}



export type ExpressionPhase
  = 'const'
  | 'val'
  | 'var'
  | 'flow'
  ;

export type FunctionPhase
  = 'fun'
  | 'def'
  | 'sig'
  ;

const expressionPhaseKeywords = Set(['const', 'val', 'var', 'flow']);

export function isExpressionPhase(key: string): key is ExpressionPhase {
  return expressionPhaseKeywords.has(key);
}

const functionPhaseKeywords = Set(['fun', 'def', 'sig']);

export function isFunctionPhase(key: string): key is FunctionPhase {
  return functionPhaseKeywords.has(key);
}
