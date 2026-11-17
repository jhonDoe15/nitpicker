import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../typed/node-views.mts';
import { afterEffects, effectsOf, type FlowContext } from './effects.mts';
import { fact, patternNames, type Fact } from './facts.mts';
import { statementsOf, exitOf, type MaybeStatement } from './flow/exits.mts';
import { assertionFacts } from './flow/assertions.mts';
import { assignedFacts } from './flow/assignments.mts';
import { recordCaptures } from './flow/closures.mts';
import { switchFlow, type LabelCheck } from './flow/switch.mts';

type Statement = TSESTree.Statement;
type Task = { readonly statements: readonly Statement[]; readonly facts: readonly Fact[] };
type ConditionCheck = {
  readonly condition: TSESTree.Node;
  readonly expression?: undefined;
  readonly label?: undefined;
  readonly facts: readonly Fact[];
};
type ExpressionCheck = {
  readonly condition?: undefined;
  readonly expression: TSESTree.Node;
  readonly label?: undefined;
  readonly facts: readonly Fact[];
};
type SwitchCheck = LabelCheck & {
  readonly condition?: undefined;
  readonly expression?: undefined;
};
export type StatementCheck = ConditionCheck | ExpressionCheck;
export type Check = StatementCheck | SwitchCheck;
type Flow = {
  readonly checks: Check[];
  readonly children: Task[];
  readonly after: readonly Fact[];
};
type Guard = {
  readonly holds: boolean;
  readonly exit?: string | undefined;
  readonly branch?: MaybeStatement;
};
type Loop =
  | TSESTree.WhileStatement
  | TSESTree.DoWhileStatement
  | TSESTree.ForStatement
  | TSESTree.ForInStatement
  | TSESTree.ForOfStatement;
type Declaration =
  | TSESTree.VariableDeclaration
  | TSESTree.FunctionDeclarationWithName
  | TSESTree.ClassDeclarationWithName;

function isLoop(node: TSESTree.Node): node is Loop {
  return (
    node.type === AST_NODE_TYPES.WhileStatement ||
    node.type === AST_NODE_TYPES.DoWhileStatement ||
    node.type === AST_NODE_TYPES.ForStatement ||
    node.type === AST_NODE_TYPES.ForInStatement ||
    node.type === AST_NODE_TYPES.ForOfStatement
  );
}

function isDeclaration(node: Statement): node is Declaration {
  return (
    node.type === AST_NODE_TYPES.VariableDeclaration ||
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.ClassDeclaration
  );
}

function ownExpressions(node: Statement): readonly TSESTree.ReturnStatement['argument'][] {
  if (node.type === AST_NODE_TYPES.ExpressionStatement) {
    return [node.expression];
  }
  if (node.type === AST_NODE_TYPES.ReturnStatement || node.type === AST_NODE_TYPES.ThrowStatement) {
    return [node.argument];
  }
  return node.type === AST_NODE_TYPES.VariableDeclaration
    ? node.declarations.map(({ init }) => init)
    : [];
}

function declaredNames(statements: readonly Statement[]): TSESTree.Node[] {
  return statements
    .filter(isDeclaration)
    .flatMap((statement) =>
      statement.type === AST_NODE_TYPES.VariableDeclaration
        ? statement.declarations.map(({ id }) => id)
        : [statement.id],
    );
}

function lineOf(node: TSESTree.Node): number {
  return node.loc.start.line;
}

function guardFact(
  test: TSESTree.Node,
  sourceCode: SourceCode,
  { holds, exit }: Pick<Guard, 'holds' | 'exit'>,
): Fact {
  const text = sourceCode.getText(test);
  const line = String(lineOf(test));
  const reason =
    exit === undefined
      ? `it is inside the ${holds ? '' : '`else` of the '}\`if (${text})\` on line ${line}`
      : `line ${line} ${exit} when \`${text}\` is ${holds ? 'false' : 'true'}`;
  return fact(test, sourceCode, { holds, reason });
}

function guardFacts(node: TSESTree.IfStatement, context: FlowContext, guard: Guard): Fact[] {
  const { holds, exit, branch } = guard;
  const { sourceCode, mutable } = context;
  const known = guardFact(node.test, sourceCode, { holds, exit });
  const afterTest = afterEffects([known], effectsOf([node.test], context), mutable);
  return afterEffects(afterTest, effectsOf([branch], context), mutable);
}

function afterIf(
  node: TSESTree.IfStatement,
  atTest: readonly Fact[],
  context: FlowContext,
): Fact[] {
  const { mutable } = context;
  const consequentExit = exitOf(node.consequent);
  const alternateExit = node.alternate === null ? undefined : exitOf(node.alternate);
  const consequentEffects = effectsOf([node.consequent], context);
  const alternateEffects = effectsOf([node.alternate], context);
  if (consequentExit !== undefined && alternateExit === undefined) {
    return [
      ...afterEffects(atTest, alternateEffects, mutable),
      ...guardFacts(node, context, { holds: false, exit: consequentExit, branch: node.alternate }),
    ];
  }
  if (alternateExit !== undefined && consequentExit === undefined) {
    return [
      ...afterEffects(atTest, consequentEffects, mutable),
      ...guardFacts(node, context, { holds: true, exit: alternateExit, branch: node.consequent }),
    ];
  }
  return consequentExit === undefined
    ? afterEffects(afterEffects(atTest, consequentEffects, mutable), alternateEffects, mutable)
    : [];
}

function ifFlow(node: TSESTree.IfStatement, facts: readonly Fact[], context: FlowContext): Flow {
  const atTest = afterEffects(facts, effectsOf([node.test], context), context.mutable);
  const children = [
    {
      statements: statementsOf(node.consequent),
      facts: [...atTest, ...guardFacts(node, context, { holds: true })],
    },
    {
      statements: statementsOf(node.alternate),
      facts: [...atTest, ...guardFacts(node, context, { holds: false })],
    },
  ];
  const after = afterIf(node, atTest, context);
  return { checks: [{ condition: node.test, facts: atTest }], children, after };
}

function guardingTest(node: Loop): TSESTree.Expression | undefined {
  if (node.type === AST_NODE_TYPES.WhileStatement) {
    return node.test;
  }
  return node.type === AST_NODE_TYPES.ForStatement && node.test !== null ? node.test : undefined;
}

function loopFlow(node: Loop, facts: readonly Fact[], context: FlowContext): Flow {
  const { sourceCode, mutable } = context;
  const inLoop = afterEffects(facts, effectsOf([node], context), mutable);
  const guardTest = guardingTest(node);
  const entry =
    guardTest === undefined
      ? inLoop
      : [
          ...inLoop,
          ...afterEffects(
            [
              fact(guardTest, sourceCode, {
                holds: true,
                reason: `the loop on line ${String(lineOf(node))} only runs while \`${sourceCode.getText(guardTest)}\``,
              }),
            ],
            effectsOf([guardTest], context),
            mutable,
          ),
        ];
  const test = node.type === AST_NODE_TYPES.DoWhileStatement ? node.test : guardTest;
  return {
    checks: test === undefined ? [] : [{ condition: test, facts: inLoop }],
    children: [{ statements: statementsOf(node.body), facts: entry }],
    after: inLoop,
  };
}

function nestedLists(node: Statement): (readonly Statement[])[] {
  if (node.type === AST_NODE_TYPES.BlockStatement) {
    return [node.body];
  }
  if (node.type === AST_NODE_TYPES.LabeledStatement) {
    return [statementsOf(node.body)];
  }
  if (node.type === AST_NODE_TYPES.SwitchStatement) {
    return node.cases.map((switchCase) => switchCase.consequent);
  }
  if (node.type === AST_NODE_TYPES.TryStatement) {
    return [node.block.body, node.handler?.body.body ?? [], node.finalizer?.body ?? []];
  }
  return [];
}

const KEPT_ENTRY = new Set<string>([
  AST_NODE_TYPES.BlockStatement,
  AST_NODE_TYPES.LabeledStatement,
]);

function otherFlow(node: Statement, facts: readonly Fact[], context: FlowContext): Flow {
  const { mutable } = context;
  const after =
    node.type === AST_NODE_TYPES.FunctionDeclaration
      ? facts
      : afterEffects(facts, effectsOf([node], context), mutable);
  const lists = nestedLists(node);
  const own = ownExpressions(node).filter((expression) => expression !== null);
  recordCaptures(own, facts, context);
  const checks = own.map((expression) => ({ expression, facts: after }));
  const entry = KEPT_ENTRY.has(node.type) ? facts : after;
  const cases =
    node.type === AST_NODE_TYPES.SwitchStatement ? switchFlow(node, after, context) : undefined;
  const { sourceCode } = context;
  return {
    checks: [...checks, ...(cases?.checks ?? [])],
    children: cases?.children ?? lists.map((statements) => ({ statements, facts: entry })),
    after: [...after, ...assignedFacts(node, sourceCode), ...assertionFacts(node, sourceCode)],
  };
}

function statementFlow(node: Statement, facts: readonly Fact[], context: FlowContext): Flow {
  if (node.type === AST_NODE_TYPES.IfStatement) {
    return ifFlow(node, facts, context);
  }
  return isLoop(node) ? loopFlow(node, facts, context) : otherFlow(node, facts, context);
}

function shadowed(facts: readonly Fact[], statements: readonly Statement[]): Fact[] {
  const names = declaredNames(statements).flatMap((id) => patternNames(id));
  const writes = new Set(names);
  return facts.filter((known) => ![...known.names].some((name) => writes.has(name)));
}

/**
 * Walks the statements of one function body and returns every condition check with the facts
 * known to hold there: `{ condition }` for an `if` test, `{ expression }` for conditions nested in
 * a statement's own expressions.
 */
export function conditionChecks(body: readonly Statement[], context: FlowContext): Check[] {
  const pending: Task[] = [{ statements: body, facts: [] }];
  const checks: Check[] = [];
  for (const task of pending) {
    let facts: readonly Fact[] = shadowed(task.facts, task.statements);
    for (const statement of task.statements) {
      const flow = statementFlow(statement, facts, context);
      checks.push(...flow.checks);
      pending.push(...flow.children.filter(({ statements }) => statements.length > 0));
      facts = flow.after;
    }
  }
  return checks;
}
