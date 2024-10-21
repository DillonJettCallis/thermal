import { Parser } from "./parser/parser.js";
import { DependencyDictionary, PackageName, Symbol, Version } from "./ast.js";
import { coreLib } from "./lib.js";
import { collectSymbols } from "./checker/collector.js";
import { Map } from "immutable";
import { verifyImports } from "./checker/verifier.js";
import { Checker } from "./checker/checker.js";
import { CheckedAccessRecord } from "./checker/checkerAst.js";
import { readdirSync } from "node:fs";
import { substringBeforeLast } from "./utils.js";

function main(): void {
  const dir = 'sample';

  const version = new Version(0, 1, 0);
  const packageName = new PackageName('sample', 'sample', version);
  const root = new Symbol(packageName);

  const depDict = new DependencyDictionary();
  const rootManager = depDict.addManager(packageName);
  const {package: corePackage, preamble, coreTypes} = coreLib();
  depDict.addManager(corePackage.name);
  rootManager.addDependency(corePackage.name);

  const allFiles = readdirSync(dir).map(file => Parser.parseFile(`${dir}/${file}`, root.child(substringBeforeLast(file, '.thermal'))));
  // const allFiles = [Parser.parseFile(`${dir}/simple.thermal`, root.child('simple'))];
  const allApplicationSymbols = collectSymbols(allFiles, rootManager, preamble);
  const allProgramSymbols = Map<PackageName, Map<Symbol, CheckedAccessRecord>>().asMutable();
  allProgramSymbols.set(corePackage.name, corePackage.declarations);
  allProgramSymbols.set(packageName, allApplicationSymbols);

  // throws exception if an import is invalid
  verifyImports(allFiles, rootManager, allProgramSymbols);

  const checker = new Checker(rootManager, allProgramSymbols, coreTypes, preamble);

  allFiles.forEach(file => checker.checkFile(file));

  console.log(allFiles);
}


main();
