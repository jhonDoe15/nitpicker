import { classOf, flattenClasses } from './kotlin-classes.mjs';
import { functionOf, propertyOf } from './kotlin-declarations.mjs';
import { createResolver, parseImport } from '../syntax/kotlin-names.mjs';
import { createSource, kids, kid, textOf } from '../syntax/kotlin-tree.mjs';

function importsOf(source, tree) {
  return kids(kid(tree, 'IMPORT_LIST'), 'IMPORT_DIRECTIVE')
    .map((node) => parseImport(textOf(source, node)))
    .filter((parsed) => parsed !== undefined)
    .map((parsed) => ({ name: undefined, path: undefined, star: undefined, ...parsed }));
}

function packageOf(source, tree) {
  const directive = kid(tree, 'PACKAGE_DIRECTIVE');
  return /^package\s+([\w.`]+)/.exec(textOf(source, directive))?.[1].replaceAll('`', '') ?? '';
}

export function readKotlinFile({ file, text, tree }) {
  const source = createSource(file, text);
  const packageName = packageOf(source, tree);
  const resolver = createResolver({ imports: importsOf(source, tree), packageName });
  const topLevel = kids(tree);
  const classes = flattenClasses(
    topLevel
      .filter((node) => node.t === 'CLASS' || node.t === 'OBJECT_DECLARATION')
      .map((node) => classOf(source, node, undefined)),
  );
  return {
    source,
    tree,
    packageName,
    resolver,
    classes,
    functions: [
      ...topLevel.filter((node) => node.t === 'FUN').map((node) => functionOf(source, node)),
      ...classes.flatMap((declaration) => declaration.functions),
    ],
    properties: [
      ...topLevel.filter((node) => node.t === 'PROPERTY').map((node) => propertyOf(source, node)),
      ...classes.flatMap((declaration) => declaration.properties),
    ],
  };
}
