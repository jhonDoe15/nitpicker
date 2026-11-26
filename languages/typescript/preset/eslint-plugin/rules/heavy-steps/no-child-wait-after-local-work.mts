import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import type { ModuleBindings } from '../analysis/subprocess-calls.mts';
import { trackedBindings } from '../processes/process-callees.mts';
import { ancestorsOf, contains } from '../typed/node-views.mts';
import { startsChild, stepCall, type ChildBodies } from './child-steps.mts';

type Step = {
  readonly statement: TSESTree.Statement;
  readonly id: TSESTree.Identifier;
  readonly child: boolean;
  readonly plain: boolean;
};

function stepOf(
  context: SourceContext,
  statement: TSESTree.Statement,
  bindings: ModuleBindings,
  known: ChildBodies,
): Step | undefined {
  if (
    statement.type !== AST_NODE_TYPES.VariableDeclaration ||
    statement.declarations.length !== 1
  ) {
    return undefined;
  }
  const [declarator] = statement.declarations;
  const call = stepCall(declarator?.init);
  if (declarator?.id.type !== AST_NODE_TYPES.Identifier || call === undefined) {
    return undefined;
  }
  return {
    statement,
    id: declarator.id,
    child: startsChild(context, call, bindings, known),
    plain: call.callee.type === AST_NODE_TYPES.Identifier,
  };
}

function references(
  context: SourceContext,
  id: TSESTree.Identifier,
): readonly TSESTree.Identifier[] {
  return (findVariable(context, id, id.name)?.references ?? [])
    .map((reference) => reference.identifier)
    .filter(
      (identifier): identifier is TSESTree.Identifier =>
        identifier.type === AST_NODE_TYPES.Identifier && identifier !== id,
    );
}

function readIn(context: SourceContext, step: Step, statement: TSESTree.Statement): boolean {
  return references(context, step.id).some((identifier) => contains(statement, identifier));
}

function combined(context: SourceContext, local: Step, child: Step): boolean {
  const childReads = references(context, child.id);
  return references(context, local.id).some((identifier) =>
    ancestorsOf(identifier).some(
      (ancestor) =>
        ancestor.type === AST_NODE_TYPES.ArrayExpression &&
        !contains(child.statement, ancestor) &&
        childReads.some((read) => contains(ancestor, read)),
    ),
  );
}

function check(
  context: SourceContext,
  body: TSESTree.BlockStatement,
  bindings: ModuleBindings,
  known: ChildBodies,
): Step[] {
  const steps = body.body.flatMap((statement) => stepOf(context, statement, bindings, known) ?? []);
  return steps.filter(
    (step, index) =>
      step.child &&
      steps
        .slice(0, index)
        .some(
          (local) =>
            !local.child &&
            local.plain &&
            !readIn(context, local, step.statement) &&
            combined(context, local, step),
        ),
  );
}

export const rule: TSESLint.RuleModule<'childAfterLocalWork'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow waiting on a child process after in-process work it does not depend on',
    },
    schema: [],
    messages: {
      childAfterLocalWork:
        'This waits for a child process after in-process work that the child does not read, and the two results are only combined later. The parent keeps the memory that work grew (V8 does not give the pages back) while the child runs, so the machine holds both peaks at once. Run the child step first and the in-process step after it; the result keeps its order.',
    },
  },
  create(context) {
    const known: ChildBodies = new Map();
    return trackedBindings('plain', (current) => {
      const visit = (node: TSESTree.FunctionLike) => {
        if (node.body?.type !== AST_NODE_TYPES.BlockStatement) {
          return;
        }
        for (const step of check(context, node.body, current(), known)) {
          context.report({ node: step.statement, messageId: 'childAfterLocalWork' });
        }
      };
      return {
        FunctionDeclaration: visit,
        FunctionExpression: visit,
        ArrowFunctionExpression: visit,
      };
    });
  },
};
