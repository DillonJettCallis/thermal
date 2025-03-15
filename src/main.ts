import { Parser } from './parser/parser.ts';
import { DependencyDictionary, PackageName, Symbol, TypeDictionary, Version } from './ast.ts';
import { coreLib, domLib } from './lib.ts';
import { collectSymbols } from './checker/collector.ts';
import { List, Map } from 'immutable';
import { verifyImports } from './checker/verifier.ts';
import { Checker } from './checker/checker.ts';
import { substringBeforeLast } from './utils.ts';
import { JsCompiler } from './js/jsCompiler.ts';
import { JsEmitter } from './js/jsEmitter.ts';

async function main(): Promise<void> {
  const workingDir = `.`;
  const dir = 'sample';

  const version = new Version(0, 1, 0);
  const packageName = new PackageName('sample', 'sample', version);
  const root = new Symbol(packageName);

  const depDict = new DependencyDictionary();
  const rootManager = depDict.addManager(packageName);

  const typeDict = new TypeDictionary();

  const {package: corePackage, preamble, coreTypes, externs: coreExterns} = coreLib(workingDir, rootManager);
  depDict.addManager(corePackage.name);
  rootManager.addDependency(corePackage.name);

  const domPackage = domLib(workingDir, corePackage, coreTypes, rootManager, preamble);
  depDict.addManager(domPackage.name).addDependency(corePackage.name);
  rootManager.addDependency(domPackage.name);

  // const sources = readdirSync(dir);
  const sources = List.of('simple.thermal');

  const allFiles = sources.map(file => Parser.parseFile(`${workingDir}/${dir}/${file}`, root.child(substringBeforeLast(file, '.thermal'))));
  // const allFiles = [Parser.parseFile(`${dir}/simple.thermal`, root.child('simple'))];
  typeDict.loadPackage(corePackage.declarations, corePackage.methods);
  typeDict.loadPackage(domPackage.declarations, domPackage.methods);

  const { symbols, methods } = collectSymbols(allFiles, rootManager, preamble);
  typeDict.loadPackage(symbols, methods);

  // throws exception if an import is invalid
  verifyImports(allFiles, rootManager, typeDict);

  const checker = new Checker(rootManager, typeDict, coreTypes, preamble);

  // TODO: libraries need to be handled better than this
  const checkedFiles = allFiles.map(file => checker.checkFile(file)).concat(domPackage.files).concat(corePackage.files);

  const jsCompiler = new JsCompiler();
  const jsCompilePrep = checkedFiles.map(file => jsCompiler.compileFile(file, coreExterns));

  const jsEmitter = new JsEmitter(`${workingDir}/dist`);
  for (const file of jsCompilePrep) {
    await jsEmitter.emitFile(file);
  }
}

await main();
