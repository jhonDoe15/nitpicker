import { codeChildren, field } from './tree/nodes.mjs';

const VERSION_SUFFIX = /^v\d+$/u;

function packageNameOf(importPath) {
  const parts = importPath.split('/');
  const last = parts.at(-1);
  return VERSION_SUFFIX.test(last) && parts.length > 1 ? parts[parts.length - 2] : last;
}

function importSpecs(program) {
  return codeChildren(program)
    .filter(({ type }) => type === 'import_declaration')
    .flatMap((declaration) => codeChildren(declaration))
    .flatMap((child) => (child.type === 'import_spec_list' ? codeChildren(child) : [child]))
    .filter(({ type }) => type === 'import_spec');
}

export function importsOf(program) {
  const imports = new Map();
  for (const spec of importSpecs(program)) {
    const importPath = field(spec, 'path')?.text.slice(1, -1);
    const alias = field(spec, 'name')?.text;
    if (importPath !== undefined && alias !== '_' && alias !== '.') {
      imports.set(alias ?? packageNameOf(importPath), importPath);
    }
  }
  return imports;
}

function specNames(declaration) {
  return codeChildren(declaration)
    .flatMap((child) => (child.type.endsWith('_spec_list') ? codeChildren(child) : [child]))
    .flatMap((spec) => spec.childrenForFieldName('name'))
    .filter((name) => name !== null)
    .map(({ text }) => text);
}

export function topLevelNames(program) {
  return new Set(
    codeChildren(program).flatMap((node) => {
      if (node.type === 'function_declaration') {
        return [field(node, 'name').text];
      }
      return ['var_declaration', 'const_declaration', 'type_declaration'].includes(node.type)
        ? specNames(node)
        : [];
    }),
  );
}
