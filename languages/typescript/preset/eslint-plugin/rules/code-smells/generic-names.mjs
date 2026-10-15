import path from 'node:path';
import { wordsOf } from '../support/identifier-words.mjs';

const GENERIC_CONTAINERS = new Set([
  'util',
  'utils',
  'utility',
  'utilities',
  'helper',
  'helpers',
  'common',
  'misc',
  'miscellaneous',
  'manager',
  'managers',
]);
const GENERIC_SUFFIXES = new Set([
  'util',
  'utils',
  'utility',
  'utilities',
  'helper',
  'helpers',
  'manager',
  'managers',
]);
const DECLARATION_TYPES = new Set([
  'ClassDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSEnumDeclaration',
]);
const FILE_START = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } };
const SOURCE_EXTENSION = /(?:\.d)?\.[cm]?[jt]sx?$/;

function isGenericContainer(name) {
  const words = wordsOf(name);
  return words.length > 0 && GENERIC_CONTAINERS.has(words.at(-1));
}

function endsGeneric(name) {
  return GENERIC_SUFFIXES.has(wordsOf(name).at(-1) ?? '');
}

function pathReports(relativePath) {
  const parts = relativePath.split(/[\\/]/);
  const file = (parts.pop() ?? '').replace(SOURCE_EXTENSION, '');
  const folder = parts.find(isGenericContainer);
  return [
    ...(isGenericContainer(file) ? [{ messageId: 'file', data: { name: file } }] : []),
    ...(folder === undefined ? [] : [{ messageId: 'folder', data: { name: folder } }]),
  ];
}

function declaredIdentifiers(statement) {
  const node = statement.declaration ?? statement;
  if (DECLARATION_TYPES.has(node.type)) return node.id ? [node.id] : [];
  if (node.type !== 'VariableDeclaration') return [];
  return node.declarations.map(({ id }) => id).filter(({ type }) => type === 'Identifier');
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Name files, folders and types for what they do, not utils or Manager' },
    schema: [],
    messages: {
      file: "The file name '{{name}}' says nothing about what the file does. Name it for its job (`price-rounding.ts`); pure logic shared between features goes in the shared folder under such a name. If the name is intended, add an exception for nitpicker/no-generic-names in nitpicker.config.json.",
      folder:
        "The folder '{{name}}' says nothing about what it holds. Group files by feature, and put pure logic shared between features in the shared folder under a name that says what it does. If the name is intended, add an exception for nitpicker/no-generic-names in nitpicker.config.json.",
      declaration:
        "'{{name}}' says nothing about what it does. Name it for its job (`PriceRounder`, `OrderTotals`) instead of Utils, Helper or Manager. If the name is intended, add an exception for nitpicker/no-generic-names in nitpicker.config.json.",
    },
  },
  create(context) {
    return {
      Program(program) {
        for (const report of pathReports(path.relative(context.cwd, context.filename))) {
          context.report({ loc: FILE_START, ...report });
        }
        const identifiers = program.body.flatMap(declaredIdentifiers);
        for (const node of identifiers.filter(({ name }) => endsGeneric(name))) {
          context.report({ node, messageId: 'declaration', data: { name: node.name } });
        }
      },
    };
  },
};
