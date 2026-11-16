import type { Node } from 'web-tree-sitter';
import { codeChildren, field, fields, required } from './tree/nodes.mts';

const NAME = 'name';
const VERSION_SUFFIX = /^v\d+$/u;

function packageNameOf(importPath: string): string {
  const [last = importPath, parent] = importPath.split('/').toReversed();
  return VERSION_SUFFIX.test(last) && parent !== undefined ? parent : last;
}

function importSpecs(program: Node): Node[] {
  return codeChildren(program)
    .filter(({ type }) => type === 'import_declaration')
    .flatMap((declaration) => codeChildren(declaration))
    .flatMap((child) => (child.type === 'import_spec_list' ? codeChildren(child) : [child]))
    .filter(({ type }) => type === 'import_spec');
}

export function importsOf(program: Node): Map<string, string> {
  const imports = new Map<string, string>();
  for (const spec of importSpecs(program)) {
    const importPath = field(spec, 'path')?.text.slice(1, -1);
    const alias = field(spec, NAME)?.text;
    if (importPath !== undefined && alias !== '_' && alias !== '.') {
      imports.set(alias ?? packageNameOf(importPath), importPath);
    }
  }
  return imports;
}

function specNames(declaration: Node): string[] {
  return codeChildren(declaration)
    .flatMap((child) => (child.type.endsWith('_spec_list') ? codeChildren(child) : [child]))
    .flatMap((spec) => fields(spec, NAME))
    .map(({ text }) => text);
}

export function topLevelNames(program: Node): Set<string> {
  return new Set(
    codeChildren(program).flatMap((node) => {
      if (node.type === 'function_declaration') {
        return [required(node, NAME).text];
      }
      return ['var_declaration', 'const_declaration', 'type_declaration'].includes(node.type)
        ? specNames(node)
        : [];
    }),
  );
}
