import { resolveConstant, stringValue } from '../../analysis/constant-resolution.mjs';
import { bindingsOf, importedFunction, isModuleValue, loadedModule } from '../imported-names.mjs';
import { leafValues, propertyNamed, staticKey, unwrapped } from '../security-values.mjs';

const CODE_REBUILDING_PACKAGES = new Set(['node-serialize', 'funcster', 'cryo']);
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
const YAML_LOADERS = new Set(['load', 'loadAll']);
const LEGACY_YAML_MAJOR = 3;
const BSON_FUNCTION_OPTIONS = new Set(['evalFunctions', 'cacheFunctions']);
const ENTITY_OPTIONS = new Set(['noent']);

function importedSource(node) {
  if (node.type === 'ImportDeclaration') {
    return node.source.value;
  }
  if (node.type === 'TSImportEqualsDeclaration') {
    return node.moduleReference.type === 'TSExternalModuleReference'
      ? stringValue(node.moduleReference.expression)
      : undefined;
  }
  return loadedModule(node);
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

function isSerializeCall(scope, node) {
  const call = unwrapped(resolveConstant(scope.context, unwrapped(node)));
  return (
    call?.type === 'CallExpression' &&
    importedFunction(scope.context, call.callee, scope.v8) === 'serialize'
  );
}

function checkInvocation(scope, node) {
  const reader = importedFunction(scope.context, node.callee, scope.v8);
  if (V8_READERS.has(reader)) {
    const clone = reader === 'deserialize' && isSerializeCall(scope, node.arguments[0]);
    report(scope, node, clone ? ['v8Clone', reader] : ['v8Deserialize', reader]);
    return;
  }
  const runner = runsTextAsCode(scope, node);
  if (runner !== undefined) {
    report(scope, node, ['runsText', `vm.${runner}`]);
  }
}

function checkLegacyYamlLoad(scope, node) {
  const loader = importedFunction(scope.context, node.callee, scope.yaml);
  if (scope.yamlMajor !== LEGACY_YAML_MAJOR || !YAML_LOADERS.has(loader)) {
    return;
  }
  const options = node.arguments[loader === 'loadAll' ? 2 : 1] ?? node.arguments[1];
  const schema =
    options === undefined ? undefined : propertyNamed(scope.context, options, 'schema');
  if (schema === undefined) {
    report(scope, node, ['yamlLegacyLoad', loader]);
  }
}

function checkYamlMember(scope, node) {
  const schema = importedFunction(scope.context, node, scope.yaml);
  if (YAML_FULL_SCHEMAS.has(schema)) {
    report(scope, node, ['yamlFullSchema', schema]);
  }
}

function checkYamlImport(scope, node) {
  const source = node.parent.source?.value;
  const imported = node.type === 'ExportSpecifier' ? node.local : node.imported;
  const name = imported.name ?? imported.value;
  if (YAML_MODULES.has(source) && YAML_FULL_SCHEMAS.has(name)) {
    report(scope, node, ['yamlFullSchema', name]);
  }
}

function checkYamlPattern(scope, node) {
  const fromYaml =
    node.id.type === 'ObjectPattern' && isModuleValue(scope.context, node.init, scope.yaml);
  for (const property of fromYaml ? node.id.properties : []) {
    const key = staticKey(property);
    if (YAML_FULL_SCHEMAS.has(key)) {
      report(scope, property, ['yamlFullSchema', key]);
    }
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
    schema: [
      {
        type: 'object',
        properties: { yamlMajor: { type: 'integer' } },
        additionalProperties: false,
      },
    ],
    messages: {
      rebuildsCode:
        '`{{name}}` rebuilds functions from the data it reads, so a crafted payload runs code. Read the data as JSON, `JSON.parse(text)`, and check it against a schema (zod, valibot) into a typed value. An exception fits only when this process alone writes and reads the data.',
      v8Clone:
        '`v8.deserialize(v8.serialize(value))` copies a value through the structured-clone bytes. Copy it with `structuredClone(value)`, which keeps `Map`, `Set`, `Date` and cycles and parses no bytes. An exception fits only when you need the v8 wire format here.',
      yamlLegacyLoad:
        '`yaml.{{name}}` in js-yaml 3 loads with `DEFAULT_FULL_SCHEMA`, so `!!js/function` tags build functions from the text. Use `yaml.safeLoad(text)` (or pass `{ schema: yaml.JSON_SCHEMA }`), or upgrade to js-yaml 4 where `load` is safe, and check the result against a schema. An exception fits only when you need custom tags.',
      v8Deserialize:
        '`v8.{{name}}` trusts its bytes as a structured clone of the writer. Read untrusted input as JSON, `JSON.parse(text)`, and check it against a schema (zod, valibot). An exception fits only when this process alone writes and reads the bytes.',
      runsText:
        '`{{name}}` runs text as code, and a vm context is not a security boundary. Do not execute data: look the behavior up in a table keyed by name, or read the data as JSON and check it against a schema. A fixed string literal is allowed. An exception fits only when the text is trusted and cannot be a literal.',
      yamlFullSchema:
        '`{{name}}` lets YAML tags build arbitrary objects and call functions. Load YAML with the default safe schema, `yaml.load(text)` in js-yaml 4 (`JSON_SCHEMA` or `CORE_SCHEMA` for plain data), and check the result against a schema. An exception fits only when you need custom tags.',
      bsonFunctions:
        '`{{name}}: true` compiles functions stored in the document, so a crafted document runs code. Leave it off and store plain data. An exception fits only when you must read stored functions.',
      entityExpansion:
        '`noent: true` expands external XML entities, so a crafted document can read local files (XXE). Leave it off, which is the default, and parse the XML as data. An exception fits only when the XML is produced by this process.',
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
          yamlMajor: context.options[0]?.yamlMajor,
        };
      },
      ImportDeclaration(node) {
        checkSource(scope, node);
      },
      TSImportEqualsDeclaration(node) {
        checkSource(scope, node);
      },
      ImportExpression(node) {
        checkSource(scope, node);
      },
      CallExpression(node) {
        checkSource(scope, node);
        checkInvocation(scope, node);
        checkLegacyYamlLoad(scope, node);
      },
      VariableDeclarator(node) {
        checkYamlPattern(scope, node);
      },
      ExportSpecifier(node) {
        checkYamlImport(scope, node);
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
