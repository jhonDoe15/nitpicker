import type TypeScript from 'typescript';
import { resolveModuleSpecifier as untypedResolve } from '../../../../../modules/module-resolution.mts';
import { cachedValue } from '../../../../../../../../shared/values/caching/cached-value.mts';
import { ts, withoutParentheses } from '../../../typed/typescript-views.mts';
import { readTextFile } from '../../support/file-reads.mts';
import { packageSourceMatches, projectSourceFiles } from '../../support/package-facts.mts';
import { scriptKindOf } from '../../support/typed-sources.mts';

type Resolution = { readonly kind: string; readonly path?: string };

const resolveModuleSpecifier: (written: string, containingFile: string) => Resolution =
  untypedResolve;

const NO_SSR = /\bssr\s*:\s*false\b/u;
const HYDRATES = /\bimport\s*\{[^}]*\bhydrateRoot\b[^}]*\}\s*from\s*['"]react-dom\/client['"]/u;
const clientOnly = new WeakMap<readonly string[], ReadonlySet<string>>();

function turnsOffSsr(options: TypeScript.Expression | undefined): boolean {
  const value = options === undefined ? undefined : withoutParentheses(options);
  return (
    value !== undefined &&
    ts.isObjectLiteralExpression(value) &&
    value.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'ssr' &&
        property.initializer.kind === ts.SyntaxKind.FalseKeyword,
    )
  );
}

function descendants(root: TypeScript.Node): TypeScript.Node[] {
  const nodes: TypeScript.Node[] = [root];
  for (const node of nodes) {
    ts.forEachChild(node, (child) => {
      nodes.push(child);
    });
  }
  return nodes;
}

function importedSpecifier(node: TypeScript.Node): string[] {
  if (!ts.isCallExpression(node) || node.expression.kind !== ts.SyntaxKind.ImportKeyword) {
    return [];
  }
  const [first] = node.arguments;
  return first !== undefined && ts.isStringLiteralLike(first) ? [first.text] : [];
}

function noSsrSpecifiers(node: TypeScript.Node): string[] {
  const [loader, options] = ts.isCallExpression(node) ? node.arguments : [];
  return loader !== undefined &&
    (ts.isArrowFunction(loader) || ts.isFunctionExpression(loader)) &&
    turnsOffSsr(options)
    ? descendants(loader).flatMap(importedSpecifier)
    : [];
}

function loadedFiles(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file));
  return descendants(source)
    .flatMap(noSsrSpecifiers)
    .flatMap((specifier) => {
      const resolved = resolveModuleSpecifier(specifier, file);
      return resolved.kind === 'file' && resolved.path !== undefined ? [resolved.path] : [];
    });
}

function filesLoadedWithoutSsr(files: readonly string[]): ReadonlySet<string> {
  return new Set(
    files.flatMap((file) => {
      const read = readTextFile(file);
      return read.kind === 'read' && NO_SSR.test(read.text) ? loadedFiles(file, read.text) : [];
    }),
  );
}

export function loadedWithoutSsr(filename: string): boolean {
  const files = projectSourceFiles(filename);
  return cachedValue(clientOnly, files, filesLoadedWithoutSsr).has(filename);
}

export function hydratesServerMarkup(filename: string): boolean {
  return packageSourceMatches(filename, HYDRATES);
}
