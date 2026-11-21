import { appendAll } from '../../../lists/lists.mts';

type Task<Statement, Fact> = {
  readonly statements: readonly Statement[];
  readonly facts: readonly Fact[];
};

type Step<Statement, Fact, Check> = {
  readonly checks: readonly Check[];
  readonly children: readonly Task<Statement, Fact>[];
  readonly after: readonly Fact[];
};

type Flows<
  Statement,
  Fact,
  Check,
  Context,
  IfNode extends Statement,
  LoopNode extends Statement,
> = {
  readonly isIf: (statement: Statement) => statement is IfNode;
  readonly isLoop: (statement: Statement) => statement is LoopNode;
  readonly ifFlow: (
    node: IfNode,
    facts: readonly Fact[],
    context: Context,
  ) => Step<Statement, Fact, Check>;
  readonly loopFlow: (
    node: LoopNode,
    facts: readonly Fact[],
    context: Context,
  ) => Step<Statement, Fact, Check>;
  readonly otherFlow: (
    node: Statement,
    facts: readonly Fact[],
    context: Context,
  ) => Step<Statement, Fact, Check>;
};

type Walker<
  Statement,
  Fact,
  Check,
  Context,
  IfNode extends Statement,
  LoopNode extends Statement,
> = Flows<Statement, Fact, Check, Context, IfNode, LoopNode> & {
  readonly shadowed: (facts: readonly Fact[], statements: readonly Statement[]) => Fact[];
};

function statementFlow<
  Statement,
  Fact,
  Check,
  Context,
  IfNode extends Statement,
  LoopNode extends Statement,
>(
  statement: Statement,
  { facts, context }: { readonly facts: readonly Fact[]; readonly context: Context },
  flows: Flows<Statement, Fact, Check, Context, IfNode, LoopNode>,
): Step<Statement, Fact, Check> {
  if (flows.isIf(statement)) {
    return flows.ifFlow(statement, facts, context);
  }
  return flows.isLoop(statement)
    ? flows.loopFlow(statement, facts, context)
    : flows.otherFlow(statement, facts, context);
}

export function walkConditionChecks<
  Statement,
  Fact,
  Check,
  Context,
  IfNode extends Statement,
  LoopNode extends Statement,
>(
  body: readonly Statement[],
  context: Context,
  { shadowed, ...flows }: Walker<Statement, Fact, Check, Context, IfNode, LoopNode>,
): Check[] {
  const pending: Task<Statement, Fact>[] = [{ statements: body, facts: [] }];
  const checks: Check[] = [];
  for (const task of pending) {
    let facts: readonly Fact[] = shadowed(task.facts, task.statements);
    for (const statement of task.statements) {
      const next = statementFlow(statement, { facts, context }, flows);
      appendAll(checks, next.checks);
      appendAll(
        pending,
        next.children.filter(({ statements }) => statements.length > 0),
      );
      facts = next.after;
    }
  }
  return checks;
}
