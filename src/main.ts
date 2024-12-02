import { Parser } from './parser/parser.ts';
import { DependencyDictionary, PackageName, Symbol, Version } from './ast.ts';
import { coreLib } from './lib.ts';
import { collectSymbols } from './checker/collector.ts';
import { Map } from 'immutable';
import { verifyImports } from './checker/verifier.ts';
import { Checker } from './checker/checker.ts';
import { readdirSync } from 'node:fs';
import { substringBeforeLast } from './utils.ts';
import type { CheckedAccessRecord } from './checker/checkerAst.ts';
import { JsCompiler } from "./js/jsCompiler.ts";
import { JsEmitter } from "./js/jsEmitter.ts";

async function main(): Promise<void> {
  const dir = 'sample';

  const version = new Version(0, 1, 0);
  const packageName = new PackageName('sample', 'sample', version);
  const root = new Symbol(packageName);

  const depDict = new DependencyDictionary();
  const rootManager = depDict.addManager(packageName);
  const {package: corePackage, preamble, coreTypes} = coreLib();
  depDict.addManager(corePackage.name);
  rootManager.addDependency(corePackage.name);

  // const sources = readdirSync(dir);
  const sources = ['simple.thermal'];

  const allFiles = sources.map(file => Parser.parseFile(`${dir}/${file}`, root.child(substringBeforeLast(file, '.thermal'))));
  // const allFiles = [Parser.parseFile(`${dir}/simple.thermal`, root.child('simple'))];
  const allApplicationSymbols = collectSymbols(allFiles, rootManager, preamble);
  const allProgramSymbols = Map<PackageName, Map<Symbol, CheckedAccessRecord>>().asMutable();
  allProgramSymbols.set(corePackage.name, corePackage.declarations);
  allProgramSymbols.set(packageName, allApplicationSymbols);

  // throws exception if an import is invalid
  verifyImports(allFiles, rootManager, allProgramSymbols);

  const checker = new Checker(rootManager, allProgramSymbols, coreTypes, preamble);

  const checkedFiles = allFiles.map(file => checker.checkFile(file));

  const jsCompiler = new JsCompiler();
  const jsCompilePrep = checkedFiles.map(file => jsCompiler.compileFile(file));

  const jsEmitter = new JsEmitter('dist');
  for (const file of jsCompilePrep) {
    await jsEmitter.emitFile(file.set('name', 'simple.js'));
  }

  console.log(jsCompilePrep);
}

await main();
