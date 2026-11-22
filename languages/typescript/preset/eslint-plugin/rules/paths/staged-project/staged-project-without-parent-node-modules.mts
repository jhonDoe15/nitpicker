import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import {
  findTmpdirMkdtemp,
  hasNodeModulesMitigation,
  hasReaddirStagingLoop,
  usesStagedDirForProject,
} from './staged-project-analysis.mts';

function checkFunctionBody(
  context: Readonly<TSESLint.RuleContext<'stagedProjectWithoutParentNodeModules', []>>,
  body: TSESTree.BlockStatement,
  moduleMitigated: boolean,
): void {
  if (moduleMitigated) {
    return;
  }
  const temp = findTmpdirMkdtemp(context, body);
  if (temp === undefined) {
    return;
  }
  if (
    hasReaddirStagingLoop(context, body) &&
    usesStagedDirForProject(context, body, temp.binding)
  ) {
    context.report({ node: temp.call, messageId: 'stagedProjectWithoutParentNodeModules' });
  }
}

export const rule: TSESLint.RuleModule<'stagedProjectWithoutParentNodeModules'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require carrying parent node_modules or module-resolution flags when staging a project into a temporary folder',
    },
    schema: [],
    messages: {
      stagedProjectWithoutParentNodeModules:
        'Staging a project into a temporary folder under tmpdir() breaks Node and TypeScript upward node_modules resolution for hoisted workspace packages. Link ancestor node_modules above the staged folder, or configure NODE_PATH, typeRoots/paths, or --preserve-symlinks.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    let moduleMitigated = false;
    return {
      Program(node) {
        moduleMitigated = hasNodeModulesMitigation(context, node);
      },
      FunctionDeclaration(node) {
        checkFunctionBody(context, node.body, moduleMitigated);
      },
      FunctionExpression(node) {
        checkFunctionBody(context, node.body, moduleMitigated);
      },
      ArrowFunctionExpression(node) {
        if (node.body.type === AST_NODE_TYPES.BlockStatement) {
          checkFunctionBody(context, node.body, moduleMitigated);
        }
      },
    };
  },
};
