import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ACCEPTED_MANAGER_ROLES,
  CONTAINER_NAME_WORDS,
  GENERIC_NAME_WORDS,
} from '../../../../../../shared/naming/smell-words.mjs';
import { wordsOf } from '../../../../../../shared/naming/secret-words.mjs';

const GENERIC_WORDS = new Set(GENERIC_NAME_WORDS);
const CONTAINER_WORDS = new Set(CONTAINER_NAME_WORDS);
const VERSION_WORD = /^v?$/;
const MANAGER_WORDS = new Set(['manager', 'managers']);
const MANAGER_ROLES = new Set(ACCEPTED_MANAGER_ROLES);
const WORD_BEFORE_LAST = -2;
const IDENTIFIER = 'Identifier';
const EXPORTS_OBJECT = 'exports';
const MODULE_OBJECT = 'module';
const EXPORTS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
const TYPE_DECLARATIONS = [
  'ClassDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSEnumDeclaration',
];
const FILE_START = { line: 1, column: 0 };
const SOURCE_EXTENSION = /(?:\.d)?\.[cm]?[jt]sx?$/;
const TEST_FILE = /(?:^|\/)(?:__tests__|__mocks__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

function judgedWords(name) {
  const words = wordsOf(name)
    .map((word) => word.replace(/\d+$/, ''))
    .filter((word) => !VERSION_WORD.test(word));
  return words.length > 1 && CONTAINER_WORDS.has(words.at(-1)) ? words.slice(0, -1) : words;
}

function isGenericContainer(name) {
  const words = judgedWords(name);
  const last = words.at(-1) ?? '';
  if (!GENERIC_WORDS.has(last)) {
    return false;
  }
  return !(MANAGER_WORDS.has(last) && MANAGER_ROLES.has(words.at(WORD_BEFORE_LAST) ?? ''));
}

function isGenericFunction(name) {
  const words = judgedWords(name);
  return words.length > 0 && words.every((word) => GENERIC_WORDS.has(word));
}

function lastWord(node) {
  const name = identifierName(node) ?? node?.property?.name;
  return judgedWords(name ?? '').at(-1);
}

function followsFrameworkType(declaration) {
  if (declaration.type !== 'ClassDeclaration') {
    return false;
  }
  const word = lastWord(declaration.id);
  const implemented = (declaration.implements ?? []).map(({ expression }) => expression);
  return [declaration.superClass, ...implemented].some(
    (parent) => parent !== null && lastWord(parent) === word,
  );
}

function firstSourceFile(directory) {
  return readdirSync(directory, { recursive: true })
    .map((name) => String(name).split(path.sep).join('/'))
    .filter((name) => SOURCE_EXTENSION.test(name) && !TEST_FILE.test(name))
    .sort()
    .at(0);
}

function isFirstFileOf(folder, { cwd, relativePath }) {
  const base = path.resolve(cwd);
  const directory = path.resolve(base, folder);
  if (!directory.startsWith(base + path.sep)) {
    return false;
  }
  const first = existsSync(directory) ? firstSourceFile(directory) : undefined;
  return first === undefined || `${folder}${first}` === relativePath;
}

function folderReport(parts, location) {
  const index = parts.findIndex(isGenericContainer);
  if (index === -1) {
    return [];
  }
  const folder = `${parts.slice(0, index + 1).join('/')}/`;
  return isFirstFileOf(folder, location) ? [{ messageId: 'folder', data: { folder } }] : [];
}

function pathReports(location) {
  const parts = location.relativePath.split('/');
  const file = (parts.pop() ?? '').replace(SOURCE_EXTENSION, '');
  return [
    ...(isGenericContainer(file) ? [{ messageId: 'file', data: { name: file } }] : []),
    ...folderReport(parts, location),
  ];
}

function exportableIdentifiers(node) {
  if (node?.type === 'FunctionDeclaration') {
    return node.id ? [node.id] : [];
  }
  if (node?.type !== 'VariableDeclaration') {
    return [];
  }
  return node.declarations.map(({ id }) => id).filter(({ type }) => type === IDENTIFIER);
}

function identifierName(node) {
  return node?.type === IDENTIFIER ? node.name : undefined;
}

function exportedValueNames(value) {
  if (value.type === IDENTIFIER) {
    return [value.name];
  }
  return value.type === 'ObjectExpression'
    ? value.properties
        .filter((property) => property.type === 'Property' && property.value.type === IDENTIFIER)
        .map((property) => property.value.name)
    : [];
}

function commonJsExportNames(statement) {
  const assignment = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
  if (assignment?.type !== 'AssignmentExpression' || assignment.left.type !== 'MemberExpression') {
    return [];
  }
  const { object, property, computed } = assignment.left;
  if (computed) {
    return [];
  }
  if (identifierName(object) === MODULE_OBJECT && property.name === EXPORTS_OBJECT) {
    return exportedValueNames(assignment.right);
  }
  const exportsObject =
    identifierName(object) === EXPORTS_OBJECT ||
    (object.type === 'MemberExpression' &&
      identifierName(object.object) === MODULE_OBJECT &&
      identifierName(object.property) === EXPORTS_OBJECT);
  return exportsObject ? [property.name] : [];
}

function exportedNames(program) {
  return new Set(
    program.body.flatMap((statement) => [
      ...(statement.type === 'ExportNamedDeclaration' && statement.source === null
        ? statement.specifiers.map(({ local }) => local.name)
        : []),
      ...commonJsExportNames(statement),
    ]),
  );
}

function exportedIdentifiers(program) {
  const names = exportedNames(program);
  return program.body.flatMap((statement) => {
    const exported = EXPORTS.has(statement.type);
    return exportableIdentifiers(exported ? statement.declaration : statement).filter(
      ({ name }) => exported || names.has(name),
    );
  });
}

function isGenericDeclaration(node) {
  return node.parent.type === 'FunctionDeclaration'
    ? isGenericFunction(node.name)
    : isGenericContainer(node.name);
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Name files, folders and types for what they do, not utils or Manager' },
    schema: [],
    messages: {
      file: "The file name '{{name}}' says nothing about what the file does. Name it for its job (`price-rounding.ts`); pure logic shared between features goes in the shared folder under such a name. An exception fits only when the name is intended.",
      folder:
        "The folder '{{folder}}' says nothing about what it holds (reported once, on its first file). Group files by feature, and put pure logic shared between features in the shared folder under a name that says what it does. An exception fits only when the name is intended.",
      declaration:
        "'{{name}}' says nothing about what it does. Name it for its job (`PriceRounder`, `OrderTotals`) instead of Utils, Helper, Manager, Common or Misc. An exception fits only when the name is intended.",
    },
  },
  create(context) {
    const types = [];
    const relativePath = path.relative(context.cwd, context.filename).split(path.sep).join('/');
    function addType(node) {
      if (node.id && !followsFrameworkType(node) && isGenericContainer(node.id.name)) {
        types.push(node.id);
      }
    }
    return {
      ...Object.fromEntries(TYPE_DECLARATIONS.map((type) => [type, addType])),
      'Program:exit'(program) {
        for (const report of pathReports({ cwd: context.cwd, relativePath })) {
          context.report({ loc: FILE_START, ...report });
        }
        const declared = exportedIdentifiers(program).filter(isGenericDeclaration);
        for (const node of [...types, ...declared]) {
          context.report({ node, messageId: 'declaration', data: { name: node.name } });
        }
      },
    };
  },
};
