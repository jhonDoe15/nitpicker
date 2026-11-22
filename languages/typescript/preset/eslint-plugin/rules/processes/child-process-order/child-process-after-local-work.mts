import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceContext } from '../../analysis/constant-resolution.mts';
import type { ModuleBindings } from '../../analysis/subprocess-calls.mts';
import { isTestFile } from '../../analysis/test-files/test-file-path.mts';
import { trackedBindings } from '../process-callees.mts';
import { reachesChildProcess } from './child-process-reachability.mts';
import { isNonTrivialLocalWork, producedBindings, readIdentifiers } from './statement-analysis.mts';

type StatementInfo = {
  readonly statement: TSESTree.Statement;
  readonly startsProcess: boolean;
  readonly localWork: boolean;
  readonly produced: ReadonlySet<string>;
  readonly reads: ReadonlySet<string>;
};

function overlaps(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const name of left) {
    if (right.has(name)) {
      return true;
    }
  }
  return false;
}

function analyzeStatements(
  context: SourceContext,
  statements: readonly TSESTree.Statement[],
  bindings: ModuleBindings,
): StatementInfo[] {
  return statements.map((statement) => {
    const startsProcess = reachesChildProcess(context, statement, bindings);
    return {
      statement,
      startsProcess,
      localWork: !startsProcess && isNonTrivialLocalWork(context, statement),
      produced: producedBindings(context, statement),
      reads: readIdentifiers(context, statement),
    };
  });
}

function isUnusedBefore(
  infos: readonly StatementInfo[],
  workIndex: number,
  processIndex: number,
): boolean {
  const workBindings = infos[workIndex]?.produced;
  if (workBindings === undefined || workBindings.size === 0) {
    return false;
  }
  for (let index = workIndex + 1; index <= processIndex; index += 1) {
    const entry = infos[index];
    if (entry !== undefined && overlaps(workBindings, entry.reads)) {
      return false;
    }
  }
  return true;
}

function combinedAfter(
  infos: readonly StatementInfo[],
  workIndex: number,
  processIndex: number,
): boolean {
  const workBindings = infos[workIndex]?.produced;
  const processBindings = infos[processIndex]?.produced;
  if (
    workBindings === undefined ||
    processBindings === undefined ||
    workBindings.size === 0 ||
    processBindings.size === 0
  ) {
    return false;
  }
  for (let index = processIndex + 1; index < infos.length; index += 1) {
    const entry = infos[index];
    if (
      entry !== undefined &&
      overlaps(workBindings, entry.reads) &&
      overlaps(processBindings, entry.reads)
    ) {
      return true;
    }
  }
  return false;
}

function hasIndependentLocalWorkBefore(
  infos: readonly StatementInfo[],
  processIndex: number,
): boolean {
  for (let workIndex = 0; workIndex < processIndex; workIndex += 1) {
    const candidate = infos[workIndex];
    if (
      candidate !== undefined &&
      candidate.localWork &&
      isUnusedBefore(infos, workIndex, processIndex) &&
      combinedAfter(infos, workIndex, processIndex)
    ) {
      return true;
    }
  }
  return false;
}

function reportMisorderedProcesses(
  context: Readonly<TSESLint.RuleContext<'childProcessAfterLocalWork', []>>,
  body: TSESTree.BlockStatement,
  bindings: ModuleBindings,
): void {
  const infos = analyzeStatements(context, body.body, bindings);
  for (let index = 0; index < infos.length; index += 1) {
    const entry = infos[index];
    if (
      entry !== undefined &&
      entry.startsProcess &&
      entry.produced.size > 0 &&
      hasIndependentLocalWorkBefore(infos, index)
    ) {
      context.report({ node: entry.statement, messageId: 'childProcessAfterLocalWork' });
    }
  }
}

export const rule: TSESLint.RuleModule<'childProcessAfterLocalWork'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer starting an independent child process before non-trivial in-process work so the parent does not hold peak heap while the child runs',
    },
    schema: [],
    messages: {
      childProcessAfterLocalWork:
        'Move this independent child-process step before the earlier in-process work. Running local work first inflates the parent heap and keeps it resident while the child process executes; starting the child process first lowers peak combined memory.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }
    return trackedBindings('promisified-imports-and-aliases', (current) => ({
      FunctionDeclaration(node) {
        reportMisorderedProcesses(context, node.body, current());
      },
      FunctionExpression(node) {
        reportMisorderedProcesses(context, node.body, current());
      },
      ArrowFunctionExpression(node) {
        if (node.body.type === AST_NODE_TYPES.BlockStatement) {
          reportMisorderedProcesses(context, node.body, current());
        }
      },
    }));
  },
};
