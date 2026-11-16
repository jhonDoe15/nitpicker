import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { readLayout } from '../../typed/policy-views.mts';

type Options = readonly [
  {
    readonly approvedFunctions?: readonly string[];
    readonly approvedSubprocesses?: readonly string[];
  }?,
];
type Approved = {
  readonly functions: ReadonlySet<string>;
  readonly subprocesses: ReadonlySet<string>;
};
type Bindings = { readonly functions: Set<string>; readonly subprocesses: Set<string> };

const { testRoots } = readLayout();

const DEFAULT_APPROVED_FUNCTIONS = ['startApp'];
const DEFAULT_APPROVED_SUBPROCESSES = ['AppProcess'];

function recordApprovedImports(
  node: TSESTree.ImportDeclaration,
  approved: Approved,
  bindings: Bindings,
): void {
  for (const specifier of node.specifiers) {
    if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
      continue;
    }
    const importedName =
      specifier.imported.type === AST_NODE_TYPES.Identifier
        ? specifier.imported.name
        : specifier.imported.value;
    if (approved.functions.has(importedName)) {
      bindings.functions.add(specifier.local.name);
    }
    if (approved.subprocesses.has(importedName)) {
      bindings.subprocesses.add(specifier.local.name);
    }
  }
}

function isApprovedHarnessCall({ callee }: TSESTree.CallExpression, bindings: Bindings): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return bindings.functions.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    bindings.subprocesses.has(callee.object.name) &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    ['start', 'run'].includes(callee.property.name)
  );
}

export const rule: TSESLint.RuleModule<'missingHarness', Options> = {
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
    const approved: Approved = {
      functions: new Set(options.approvedFunctions ?? DEFAULT_APPROVED_FUNCTIONS),
      subprocesses: new Set(options.approvedSubprocesses ?? DEFAULT_APPROVED_SUBPROCESSES),
    };
    const bindings: Bindings = { functions: new Set(), subprocesses: new Set() };
    let program: TSESTree.Program | undefined;
    let usesApprovedHarness = false;

    return {
      Program(node) {
        program = node;
      },
      ImportDeclaration(node) {
        recordApprovedImports(node, approved, bindings);
      },
      CallExpression(node) {
        if (isApprovedHarnessCall(node, bindings)) {
          usesApprovedHarness = true;
        }
      },
      'Program:exit'() {
        if (!usesApprovedHarness && program !== undefined) {
          context.report({ node: program, messageId: 'missingHarness' });
        }
      },
    };
  },
};
