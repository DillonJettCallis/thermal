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
import { ParserPackage } from './parser/parserAst.ts';
import { CheckedPackage } from './checker/checkerAst.ts';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as process from 'node:process';
import { readdirSync } from 'node:fs';
import { File } from './file.ts';

async function main(mainFileName: string): Promise<void> {
  const workingDir = resolve(fileURLToPath(import.meta.url), '../..');
  const dir = resolve(workingDir, 'sample');

  const version = new Version(0, 1, 0);
  const packageName = new PackageName('sample', 'sample', version);
  const root = new Symbol(packageName);

  const depDict = new DependencyDictionary();

  const {package: corePackage, preamble, coreTypes, declarations: coreDeclarations } = coreLib(workingDir);
  depDict.addManager(corePackage.name);

  const domPackage = domLib(workingDir);
  depDict.addManager(domPackage.name).addDependency(corePackage.name);

  const sources = List(readdirSync(dir));

  const selfPackage = new ParserPackage({
    name: packageName,
    files: sources.map(file => Parser.parseFile(`${dir}/${file}`, root.child(substringBeforeLast(file, '.thermal')))),
    externals: Map(),
  });

  const selfManager = depDict.addManager(packageName);
  selfManager.addDependency(corePackage.name);
  selfManager.addDependency(domPackage.name);

  const packages = List.of(corePackage, domPackage, selfPackage);

  const typeDict = new TypeDictionary(coreDeclarations);

  // load up all type information
  packages.forEach(pack => {
    typeDict.loadPackage(collectSymbols(pack.name, pack.files, depDict.getManager(pack.name)!, preamble));
  });

  // check all packages to ensure their imports are valid
  packages.forEach(pack => {
    // throws exception if an import is invalid
    verifyImports(pack.files, depDict.getManager(pack.name)!, typeDict);
  });

  const checkedPackages = packages.map(pack => {
    const checker = new Checker(depDict.getManager(pack.name)!, typeDict, coreTypes, preamble);

    return new CheckedPackage({
      name: pack.name,
      files: pack.files.map(file => checker.checkFile(file)),
      externals: pack.externals,
    })
  });

  const jsCompiler = new JsCompiler(checkedPackages.reduce((sum, next) => sum.merge(next.externals), Map()));
  const jsCompilePrep = checkedPackages.toSeq().flatMap(pack => pack.files).map(file => jsCompiler.compileFile(file, file.src.includes(mainFileName)));

  const jsEmitter = new JsEmitter(`${workingDir}/dist`);
  for (const file of jsCompilePrep) {
    await jsEmitter.emitFile(file);
  }

  new File(`${workingDir}/dist/main.js`).writeText(`
import { main as appMain } from './${mainFileName}.js';
import { domRenderer } from '../runtime/dom.ts';
import { main } from '../runtime/runtime.ts';

main(appMain, domRenderer);
`);
}

await main(process.argv[2]!);
