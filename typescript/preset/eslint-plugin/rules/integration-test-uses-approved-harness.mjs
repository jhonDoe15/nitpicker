import { readLayout } from '../../head-policy.mjs';

const { testRoots } = readLayout();

const DEFAULT_APPROVED_FUNCTIONS = ['startApp'];
const DEFAULT_APPROVED_SUBPROCESSES = ['AppProcess'];

export default {
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
    const approvedFunctions = new Set(options.approvedFunctions ?? DEFAULT_APPROVED_FUNCTIONS);
    const approvedSubprocesses = new Set(
      options.approvedSubprocesses ?? DEFAULT_APPROVED_SUBPROCESSES,
    );
    let program;
    const approvedFunctionBindings = new Set();
    const approvedSubprocessBindings = new Set();
    let usesApprovedHarness = false;

    return {
      Program(node) {
        program = node;
      },
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') {
            continue;
          }
          const importedName =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value;
          if (approvedFunctions.has(importedName)) {
            approvedFunctionBindings.add(specifier.local.name);
          }
          if (approvedSubprocesses.has(importedName)) {
            approvedSubprocessBindings.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && approvedFunctionBindings.has(node.callee.name)) {
          usesApprovedHarness = true;
          return;
        }
        if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.object.type === 'Identifier' &&
          approvedSubprocessBindings.has(node.callee.object.name) &&
          node.callee.property.type === 'Identifier' &&
          ['start', 'run'].includes(node.callee.property.name)
        ) {
          usesApprovedHarness = true;
        }
      },
      'Program:exit'() {
        if (!usesApprovedHarness) {
          context.report({ node: program, messageId: 'missingHarness' });
        }
      },
    };
  },
};
