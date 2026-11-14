import {
  copiedConstantData,
  copiedConstantTemplate,
  isTrivialValue,
  valueKey,
} from '../../../../../../shared/rules/copied-constants/copied-constants.mjs';
import { resolveModuleSpecifier } from '../../../modules/module-resolution.mjs';
import { isTestFunctionName, registrationRoot } from '../../rules/analysis/test-code-analysis.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { definingModules } from './defining-modules.mjs';
import { exportedConstants } from './exported-constants.mjs';
import { importedModule, loadedModule } from './module-loads.mjs';
import { byText } from '../../../../../../shared/text-order/by-text.mjs';

const PIN = 'expect({name}).toBe({value})';
const MORE_TEST_FUNCTIONS = new Set(['context', 'specify', 'bench']);
const PATH_CALLS = new Set(['mock', 'doMock', 'unmock', 'importActual', 'requireActual']);
const PROPERTY_KEYS = new Set(['Property', 'PropertyDefinition', 'MethodDefinition']);
const STATEMENT = /(?:Statement|Declaration)$/u;

function eslintTemplate(template) {
  return template.replaceAll(/\{(\w+)\}/gu, '{{$1}}');
}

function isValueImport(statement) {
  return statement.type === 'ImportDeclaration' && statement.importKind !== 'type';
}

function seenConstants(context, loads) {
  const seen = new Map();
  const imports = context.sourceCode.ast.body.filter(isValueImport).map(importedModule);
  for (const { specifier, names, whole } of [...imports, ...loads]) {
    const target = resolveModuleSpecifier(specifier, context.filename);
    if (target.kind !== 'file') {
      continue;
    }
    const only = whole
      ? undefined
      : definingModules(target.path, names.keys(), { root: context.cwd });
    const constants = exportedConstants(target.path, { root: context.cwd, only });
    for (const [name, value] of constants) {
      const member = name.split('.').at(-1);
      const mentions = [member, ...(member === name ? (names.get(name) ?? []) : [])];
      const entry = { name, owner: specifier, mentions };
      seen.set(valueKey(value), [...(seen.get(valueKey(value)) ?? []), entry]);
    }
  }
  return seen;
}

function isOwnRequire(context, node) {
  if (node.callee?.type !== 'Identifier') {
    return false;
  }
  const scopes = chainOf(context.sourceCode.getScope(node), (scope) => scope.upper);
  const variable = scopes.map((scope) => scope.set.get(node.callee.name)).find(Boolean);
  return (variable?.defs.length ?? 0) > 0;
}

function isTestName(node) {
  const call = node.parent;
  if (call?.type !== 'CallExpression' || call.arguments[0] !== node) {
    return false;
  }
  const root = registrationRoot(call.callee);
  return isTestFunctionName(root) || MORE_TEST_FUNCTIONS.has(root);
}

function isPathArgument(node) {
  const call = node.parent;
  if (call?.type !== 'CallExpression' || call.arguments[0] !== node) {
    return call?.type === 'ImportExpression';
  }
  const { callee } = call;
  return (
    (callee.type === 'Identifier' && callee.name === 'require') ||
    (callee.type === 'MemberExpression' &&
      callee.property.type === 'Identifier' &&
      PATH_CALLS.has(callee.property.name))
  );
}

function isSkippedPosition(node) {
  const { parent } = node;
  return (
    parent.type === 'ImportDeclaration' ||
    parent.type === 'ExportNamedDeclaration' ||
    parent.type === 'ExportAllDeclaration' ||
    parent.type === 'ImportExpression' ||
    parent.type === 'ImportAttribute' ||
    parent.type === 'TSLiteralType' ||
    parent.type === 'TSEnumMember' ||
    parent.type === 'TSExternalModuleReference' ||
    (PROPERTY_KEYS.has(parent.type) && parent.key === node && !parent.computed) ||
    (parent.type === 'ExpressionStatement' && parent.directive !== undefined) ||
    isTestName(node) ||
    isPathArgument(node)
  );
}

function literalOf(node) {
  if (node.type === 'TemplateLiteral') {
    return node.expressions.length === 0
      ? { node, value: { kind: 'string', value: node.quasis[0].value.cooked ?? '' } }
      : undefined;
  }
  if (typeof node.value === 'string') {
    return { node, value: { kind: 'string', value: node.value } };
  }
  if (typeof node.value !== 'number') {
    return undefined;
  }
  const negated = node.parent.type === 'UnaryExpression' && node.parent.operator === '-';
  return negated
    ? { node: node.parent, value: { kind: 'number', value: -node.value } }
    : { node, value: { kind: 'number', value: node.value } };
}

function isStatement(node) {
  return (
    STATEMENT.test(node.type) ||
    (node.parent?.type === 'ArrowFunctionExpression' && node.parent.body === node)
  );
}

function statementOf(node) {
  const chain = chainOf(node, (link) => (isStatement(link) ? undefined : link.parent));
  return chain.at(-1);
}

function namesConstant(context, node, entries) {
  const mentioned = new Set(entries.flatMap(({ mentions }) => mentions));
  return context.sourceCode
    .getTokens(statementOf(node))
    .some(({ type, value }) => type === 'Identifier' && mentioned.has(value));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a literal in a test that copies the value of a production constant the test imports.',
    },
    schema: [],
    messages: {
      copiedNumber: eslintTemplate(copiedConstantTemplate('number', PIN)),
      copiedString: eslintTemplate(copiedConstantTemplate('string', PIN)),
    },
  },
  create(context) {
    const literals = [];
    const loads = [];
    function collect(candidate) {
      const literal = literalOf(candidate);
      if (
        literal !== undefined &&
        !isTrivialValue(literal.value) &&
        !isSkippedPosition(literal.node)
      ) {
        literals.push(literal);
      }
    }
    function load(node) {
      const loaded = isOwnRequire(context, node) ? undefined : loadedModule(node);
      if (loaded !== undefined) {
        loads.push(loaded);
      }
    }
    function check(seen, literal) {
      const entries = seen.get(valueKey(literal.value));
      if (entries === undefined || namesConstant(context, literal.node, entries)) {
        return;
      }
      const names = [...new Set(entries.map(({ name }) => name))].toSorted(byText);
      const owners = [...new Set(entries.map(({ owner }) => owner))].toSorted(byText);
      context.report({
        node: literal.node,
        messageId: literal.value.kind === 'number' ? 'copiedNumber' : 'copiedString',
        data: copiedConstantData({ names, owner: owners.join(' and '), literal: literal.value }),
      });
    }
    return {
      Literal: collect,
      TemplateLiteral: collect,
      CallExpression: load,
      ImportExpression: load,
      TSImportEqualsDeclaration: load,
      'Program:exit'() {
        if (literals.length > 0) {
          const seen = seenConstants(context, loads);
          for (const literal of literals) {
            check(seen, literal);
          }
        }
      },
    };
  },
};
