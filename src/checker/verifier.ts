import { List } from 'immutable';
import { type Access, type DependencyManager, type Symbol, TypeDictionary } from '../ast.ts';
import type { ParserFile } from '../parser/parserAst.ts';
import { ParserImportDeclaration } from '../parser/parserAst.ts';

/**
 * Check this file and make sure everything it imports actually exists.
 *
 * Does not check anything about the uses of the imports, just that they point to real things that can be found.
 */
export function verifyImports(files: List<ParserFile>, manager: DependencyManager, typeDictionary: TypeDictionary): void {
  files.forEach(file => {
    file.declarations.forEach(dec => {
      if (dec instanceof ParserImportDeclaration) {
        manager.breakdownImport(dec).forEach(it => {
          const record = typeDictionary.lookupSymbol(it);

          if (record === undefined) {
            dec.pos.fail(`import '${it}' was not found.`);
          } else {
            if (!checkImport(record.access, file.module, record.name)) {
              dec.pos.fail(`import '${it}' was not found.`);
            }
          }
        });
      }
    });
  });
}


export function checkImport(access: Access, from: Symbol, to: Symbol): boolean {
  switch (access) {
    case 'private':
      // the modules have to match exactly
      return from.equals(to);
    case 'protected':
      // `isParent` also checks the package
      return to.parent()?.isParent(from) ?? false;
    case 'package':
      // are we in the same package together?
      return from.package.equals(to.package);
    case 'internal':
      // does everything but the name match?
      return from.package.set('name', '').equals(to.package.set('name', ''));
    case 'public':
      // doesn't matter the connection, everything public is always good
      return true;
  }
}
