import { Map } from "immutable";
import { Access, AccessRecord, DependencyManager, File, PackageName, Symbol } from "../ast.js";

/**
 * Check this file and make sure everything it imports actually exists.
 *
 * Does not check anything about the uses of the imports, just that they point to real things that can be found.
 */
export function verifyImports(files: File[], manager: DependencyManager, declarations: Map<PackageName, Map<Symbol, AccessRecord>>): void {
  files.forEach(file => {
    file.declarations.forEach(dec => {
      if (dec.kind === 'import') {
        manager.breakdownImport(dec).forEach(it => {
          const record = declarations.get(it.package)?.get(it);

          if (record == null) {
            dec.pos.fail(`import '${it}' was not found.`);
          } else {
            const {access, module} = record;

            if (!checkImport(access, file.module, module)) {
              dec.pos.fail(`import '${it}' was not found.`);
            }
          }
        });
      }
    })
  });
}


function checkImport(access: Access, from: Symbol, to: Symbol): boolean {
  switch (access) {
    case "private":
      // the modules have to match exactly
      return from.equals(to);
    case "protected":
      // `isParent` also checks the package
      return to.parent()?.isParent(from) ?? false;
    case "package":
      // are we in the same package together?
      return from.package.equals(to.package);
    case 'internal':
      // does everything but the name match?
      return from.package.set('name', '').equals(to.package.set('name', ''));
    case "public":
      // doesn't matter the connection, everything public is always good
      return true;
  }
}