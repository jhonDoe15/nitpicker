import { readLayout } from '../../../../head-policy.mjs';

const { testRoots } = readLayout();

const DEFAULT_APPROVED_FUNCTIONS = ['startApp'];
const DEFAULT_APPROVED_SUBPROCESSES = ['AppProcess'];

function recordApprovedImports(node, approved, bindings) {
  for (const specifier of node.specifiers) {
    if (specifier.type !== 'ImportSpecifier') continue;
    const importedName =
      specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
    if (approved.functions.has(importedName)) bindings.functions.add(specifier.local.name);
    if (approved.subprocesses.has(importedName)) bindings.subprocesses.add(specifier.local.name);
  }
}

function isApprovedHarnessCall({ callee }, bindings) {
  if (callee.type === 'Identifier') return bindings.functions.has(callee.name);
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    bindings.subprocesses.has(callee.object.name) &&
    callee.property.type === 'Identifier' &&
    ['start', 'run'].includes(callee.property.name)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require integration tests to execute an approved production harness',
    },
    schema: [
      {
        type: 'object',
        properties: {
          approvedFunctions: { type: 'array', items: { type: 'string' }, uniqueItems: true },
          approvedSubprocesses: { type: 'array', items: { type: 'string' }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingHarness: 'Exercise the application through an approved integration-test harness.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    if (!testRoots.some((root) => filename.includes(`/${root}/integration/`))) {
      return {};
    }

    const options = context.options[0] ?? {};
    const approved = {
      functions: new Set(options.approvedFunctions ?? DEFAULT_APPROVED_FUNCTIONS),
      subprocesses: new Set(options.approvedSubprocesses ?? DEFAULT_APPROVED_SUBPROCESSES),
    };
    const bindings = { functions: new Set(), subprocesses: new Set() };
    let program;
    let usesApprovedHarness = false;

    return {
      Program(node) {
        program = node;
      },
      ImportDeclaration(node) {
        recordApprovedImports(node, approved, bindings);
      },
      CallExpression(node) {
        if (isApprovedHarnessCall(node, bindings)) usesApprovedHarness = true;
      },
      'Program:exit'() {
        if (!usesApprovedHarness) {
          context.report({ node: program, messageId: 'missingHarness' });
        }
      },
    };
  },
};
