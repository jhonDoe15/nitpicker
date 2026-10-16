import { stringValue } from '../analysis/constant-resolution.mjs';
import { bindingsOf, importedFunction, leafValues, staticKey } from './security-values.mjs';

const CODE_REBUILDING_PACKAGES = new Set(['node-serialize', 'serialize-to-js', 'funcster', 'cryo']);
const V8_MODULES = new Set(['v8', 'node:v8']);
const VM_MODULES = new Set(['vm', 'node:vm']);
const YAML_MODULES = new Set(['js-yaml']);
const V8_READERS = new Set(['deserialize', 'Deserializer']);
const VM_RUNNERS = new Set([
  'runInNewContext',
  'runInThisContext',
  'runInContext',
  'compileFunction',
]);
const VM_CONSTRUCTORS = new Set(['Script', 'SourceTextModule']);
const YAML_FULL_SCHEMAS = new Set(['DEFAULT_FULL_SCHEMA', 'FULL_SCHEMA']);
const BSON_FUNCTION_OPTIONS = new Set(['evalFunctions', 'cacheFunctions']);
const ENTITY_OPTIONS = new Set(['noent']);

function importedSource(node) {
  if (node.type === 'ImportDeclaration') {
    return node.source.value;
  }
  const isRequire =
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require';
  return isRequire ? stringValue(node.arguments[0]) : undefined;
}

function isFixedText(context, node) {
  const leaves = leafValues(context, node);
  return leaves.length > 0 && leaves.every((leaf) => stringValue(leaf) !== undefined);
}

function isTrue(context, node) {
  return leafValues(context, node).some((leaf) => leaf.type === 'Literal' && leaf.value === true);
}

function report({ context }, node, finding) {
  context.report({ node, messageId: finding[0], data: { name: finding[1] } });
}

function checkSource(scope, node) {
  const source = importedSource(node);
  if (CODE_REBUILDING_PACKAGES.has(source)) {
    report(scope, node, ['rebuildsCode', source]);
  }
}

function runsTextAsCode(scope, node) {
  const runner = importedFunction(scope.context, node.callee, scope.vm);
  const known =
    VM_RUNNERS.has(runner) || (node.type === 'NewExpression' && VM_CONSTRUCTORS.has(runner));
  const text = node.arguments[0];
  return known && (text === undefined || !isFixedText(scope.context, text)) ? runner : undefined;
}

function checkInvocation(scope, node) {
  const reader = importedFunction(scope.context, node.callee, scope.v8);
  if (V8_READERS.has(reader)) {
    report(scope, node, ['v8Deserialize', reader]);
    return;
  }
  const runner = runsTextAsCode(scope, node);
  if (runner !== undefined) {
    report(scope, node, ['runsText', `vm.${runner}`]);
  }
}

function checkYamlMember(scope, node) {
  const schema = importedFunction(scope.context, node, scope.yaml);
  if (YAML_FULL_SCHEMAS.has(schema)) {
    report(scope, node, ['yamlFullSchema', schema]);
  }
}

function checkYamlImport(scope, node) {
  const imported = node.imported.name ?? node.imported.value;
  const fromYaml = YAML_MODULES.has(node.parent.source.value);
  if (fromYaml && YAML_FULL_SCHEMAS.has(imported)) {
    report(scope, node, ['yamlFullSchema', imported]);
  }
}

function checkProperty(scope, node) {
  const key = staticKey(node);
  if (!isTrue(scope.context, node.value)) {
    return;
  }
  if (BSON_FUNCTION_OPTIONS.has(key)) {
    report(scope, node, ['bsonFunctions', key]);
  } else if (ENTITY_OPTIONS.has(key)) {
    report(scope, node, ['entityExpansion', key]);
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow rebuilding code or objects from untrusted data' },
    schema: [],
    messages: {
      rebuildsCode:
        '`{{name}}` rebuilds functions from the data it reads, so a crafted payload runs code. Read the data as JSON, `JSON.parse(text)`, and check it against a schema (zod, valibot) into a typed value. If this process alone writes and reads the data, add an exception for this rule in nitpicker.config.json.',
      v8Deserialize:
        '`v8.{{name}}` trusts its bytes as a structured clone of the writer. Read untrusted input as JSON, `JSON.parse(text)`, and check it against a schema (zod, valibot). If this process alone writes and reads the bytes, add an exception for this rule in nitpicker.config.json.',
      runsText:
        '`{{name}}` runs text as code, and a vm context is not a security boundary. Do not execute data: look the behavior up in a table keyed by name, or read the data as JSON and check it against a schema. A fixed string literal is allowed. If the text is trusted and cannot be a literal, add an exception for this rule in nitpicker.config.json.',
      yamlFullSchema:
        '`{{name}}` lets YAML tags build arbitrary objects and call functions. Load YAML with the default safe schema, `yaml.load(text)` in js-yaml 4 (`JSON_SCHEMA` or `CORE_SCHEMA` for plain data), and check the result against a schema. If you need custom tags, add an exception for this rule in nitpicker.config.json.',
      bsonFunctions:
        '`{{name}}: true` compiles functions stored in the document, so a crafted document runs code. Leave it off and store plain data. If you must read stored functions, add an exception for this rule in nitpicker.config.json.',
      entityExpansion:
        '`noent: true` expands external XML entities, so a crafted document can read local files (XXE). Leave it off, which is the default, and parse the XML as data. If the XML is produced by this process, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    let scope;

    return {
      Program(node) {
        scope = {
          context,
          v8: bindingsOf(node, V8_MODULES),
          vm: bindingsOf(node, VM_MODULES),
          yaml: bindingsOf(node, YAML_MODULES),
        };
      },
      ImportDeclaration(node) {
        checkSource(scope, node);
      },
      CallExpression(node) {
        checkSource(scope, node);
        checkInvocation(scope, node);
      },
      NewExpression(node) {
        checkInvocation(scope, node);
      },
      MemberExpression(node) {
        checkYamlMember(scope, node);
      },
      ImportSpecifier(node) {
        checkYamlImport(scope, node);
      },
      Property(node) {
        checkProperty(scope, node);
      },
    };
  },
};
