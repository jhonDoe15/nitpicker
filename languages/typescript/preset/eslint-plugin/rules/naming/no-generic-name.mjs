import path from 'node:path';
import { isGenericName, lastWord } from './generic-names.mjs';

const TYPE_SELECTOR = [
  'ClassDeclaration',
  'ClassExpression',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration[id.type="Identifier"]',
].join(', ');
const ROLE_SUFFIXES = new Set([
  'd',
  'service',
  'services',
  'config',
  'controller',
  'module',
  'test',
  'spec',
  'type',
  'types',
  'dto',
  'entity',
  'model',
  'schema',
  'store',
  'resolver',
  'guard',
  'pipe',
  'middleware',
  'repository',
  'stories',
]);
const ROUTE =
  'Pure logic shared between features goes in the shared folder under a name that says what it does. An exception fits only for a name a tool or framework requires.';

function fileStem(file) {
  const segments = path.parse(file).name.split('.');
  const last = segments.findLastIndex(
    (segment, index) => index === 0 || !ROLE_SUFFIXES.has(segment.toLowerCase()),
  );
  return segments.slice(0, last + 1).join('.');
}

function projectParts(context) {
  const relative = path.relative(context.cwd ?? process.cwd(), context.filename);
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return (inside ? relative : path.basename(context.filename)).split(path.sep);
}

function superclassNames(node) {
  const heritage = [node.superClass, ...(node.implements ?? []), ...(node.extends ?? [])];
  return heritage
    .map((item) => item?.expression ?? item)
    .map((item) => (item?.type === 'MemberExpression' ? item.property : item))
    .filter((item) => item?.type === 'Identifier')
    .map((item) => item.name);
}

function followsLibraryType(node) {
  const word = lastWord(node.id.name);
  return superclassNames(node).some((name) => lastWord(name) === word);
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow files, folders and types named utils, helpers, common, misc or manager',
    },
    schema: [],
    messages: {
      genericFile: `File name "{{name}}" says nothing about what the file holds. Name it for what it does (\`price-rounding.ts\`), not utils, helpers, common, misc or manager. ${ROUTE}`,
      genericFolder: `Folder "{{name}}" says nothing about what its files hold. Name it for what they do, not utils, helpers, common, misc or manager. ${ROUTE}`,
      genericType: `Type name "{{name}}" says nothing about what it does. Name it for its job (\`PriceRounder\`, \`OrderTotals\`), not Utils, Helper, Manager, Common or Misc. ${ROUTE}`,
    },
  },
  create(context) {
    const parts = projectParts(context);
    const top = { line: 1, column: 0 };
    return {
      Program() {
        const stem = fileStem(parts.at(-1));
        const folder = parts.slice(0, -1).find(isGenericName);
        if (isGenericName(stem)) {
          context.report({ loc: top, messageId: 'genericFile', data: { name: stem } });
        }
        if (folder !== undefined) {
          context.report({ loc: top, messageId: 'genericFolder', data: { name: `${folder}/` } });
        }
      },
      [TYPE_SELECTOR](node) {
        if (node.id && isGenericName(node.id.name) && !followsLibraryType(node)) {
          context.report({
            node: node.id,
            messageId: 'genericType',
            data: { name: node.id.name },
          });
        }
      },
    };
  },
};
