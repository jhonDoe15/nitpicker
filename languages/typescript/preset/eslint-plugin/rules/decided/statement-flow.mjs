import { afterEffects, effectsOf, fact, patternNames } from './facts.mjs';

const JUMPS = new Map([
  ['ReturnStatement', 'returns'],
  ['ThrowStatement', 'throws'],
  ['BreakStatement', 'breaks'],
  ['ContinueStatement', 'continues'],
]);
const LOOPS = new Set([
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
]);
const DECLARATIONS = new Set(['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration']);
const OWN_EXPRESSIONS = new Map([
  ['ExpressionStatement', (node) => [node.expression]],
  ['ReturnStatement', (node) => [node.argument]],
  ['ThrowStatement', (node) => [node.argument]],
  ['VariableDeclaration', (node) => node.declarations.map(({ init }) => init)],
]);

function statementsOf(node) {
  if (node === null || node === undefined) {
    return [];
  }
  return node.type === 'BlockStatement' ? node.body : [node];
}

function lastStatement(node) {
  return statementsOf(node).at(-1);
}

function isLeavingBoth(statement) {
  return statement?.type === 'IfStatement' && statement.alternate !== null;
}

/** The jump a statement always ends in (`returns`, `throws`, ...), if it always leaves. */
export function exitOf(node) {
  const last = lastStatement(node);
  if (JUMPS.has(last?.type)) {
    return JUMPS.get(last.type);
  }
  const pending = [node];
  for (const current of pending) {
    const final = lastStatement(current);
    if (isLeavingBoth(final)) {
      pending.push(final.consequent, final.alternate);
    } else if (!JUMPS.has(final?.type)) {
      return undefined;
    }
  }
  return 'leaves';
}

function declaredNames(statements) {
  return statements
    .filter((statement) => DECLARATIONS.has(statement.type))
    .flatMap((statement) =>
      statement.type === 'VariableDeclaration'
        ? statement.declarations.map(({ id }) => id)
        : [statement.id],
    )
    .filter((id) => id !== null && id !== undefined);
}

function lineOf(node) {
  return node.loc.start.line;
}

function guardFact(test, sourceCode, holds, exit) {
  const text = sourceCode.getText(test);
  const line = String(lineOf(test));
  const reason =
    exit === undefined
      ? `it is inside the ${holds ? '' : '`else` of the '}\`if (${text})\` on line ${line}`
      : `line ${line} ${exit} when \`${text}\` is ${holds ? 'false' : 'true'}`;
  return fact(test, sourceCode, { holds, reason });
}

function ifFlow(node, facts, context) {
  const { sourceCode, mutable } = context;
  const atTest = afterEffects(facts, effectsOf([node.test], sourceCode), mutable);
  const children = [
    {
      statements: statementsOf(node.consequent),
      facts: [...atTest, guardFact(node.test, sourceCode, true)],
    },
    {
      statements: statementsOf(node.alternate),
      facts: [...atTest, guardFact(node.test, sourceCode, false)],
    },
  ];
  const consequentExit = exitOf(node.consequent);
  const alternateExit = node.alternate === null ? undefined : exitOf(node.alternate);
  const consequentEffects = effectsOf([node.consequent], sourceCode);
  const alternateEffects = effectsOf([node.alternate], sourceCode);
  const after = [];
  if (consequentExit !== undefined && alternateExit === undefined) {
    after.push(
      ...afterEffects(atTest, alternateEffects, mutable),
      guardFact(node.test, sourceCode, false, consequentExit),
    );
  } else if (alternateExit !== undefined && consequentExit === undefined) {
    after.push(
      ...afterEffects(atTest, consequentEffects, mutable),
      guardFact(node.test, sourceCode, true, alternateExit),
    );
  } else if (consequentExit === undefined) {
    after.push(
      ...afterEffects(afterEffects(atTest, consequentEffects, mutable), alternateEffects, mutable),
    );
  }
  return { checks: [{ condition: node.test, facts: atTest }], children, after };
}

function loopFlow(node, facts, context) {
  const { sourceCode, mutable } = context;
  const inLoop = afterEffects(facts, effectsOf([node], sourceCode), mutable);
  const isGuarded =
    node.type === 'WhileStatement' || (node.type === 'ForStatement' && node.test !== null);
  const entry = isGuarded
    ? [
        ...inLoop,
        fact(node.test, sourceCode, {
          holds: true,
          reason: `the loop on line ${String(lineOf(node))} only runs while \`${sourceCode.getText(node.test)}\``,
        }),
      ]
    : inLoop;
  return {
    checks: [],
    children: [{ statements: statementsOf(node.body), facts: entry }],
    after: inLoop,
  };
}

function nestedLists(node) {
  switch (node.type) {
    case 'BlockStatement': {
      return [node.body];
    }
    case 'LabeledStatement': {
      return [statementsOf(node.body)];
    }
    case 'SwitchStatement': {
      return node.cases.map((switchCase) => switchCase.consequent);
    }
    case 'TryStatement': {
      return [node.block.body, node.handler?.body.body ?? [], node.finalizer?.body ?? []];
    }
    default: {
      return [];
    }
  }
}

const KEPT_ENTRY = new Set(['BlockStatement', 'LabeledStatement']);

function otherFlow(node, facts, context) {
  const { sourceCode, mutable } = context;
  const after =
    node.type === 'FunctionDeclaration'
      ? facts
      : afterEffects(facts, effectsOf([node], sourceCode), mutable);
  const lists = nestedLists(node);
  const own = OWN_EXPRESSIONS.get(node.type)?.(node) ?? [];
  const checks = own.filter(Boolean).map((expression) => ({ expression, facts: after }));
  const entry = KEPT_ENTRY.has(node.type) ? facts : after;
  return { checks, children: lists.map((statements) => ({ statements, facts: entry })), after };
}

function statementFlow(node, facts, context) {
  if (node.type === 'IfStatement') {
    return ifFlow(node, facts, context);
  }
  return LOOPS.has(node.type) ? loopFlow(node, facts, context) : otherFlow(node, facts, context);
}

function shadowed(facts, statements, context) {
  const names = declaredNames(statements).flatMap((id) => patternNames(id));
  const writes = new Set(names);
  return facts.filter((known) => ![...known.names].some((name) => writes.has(name)));
}

/**
 * Walks the statements of one function body and returns every condition check with the facts
 * known to hold there: `{ condition }` for an `if` test, `{ expression }` for conditions nested in
 * a statement's own expressions.
 */
export function conditionChecks(body, context) {
  const pending = [{ statements: body, facts: [] }];
  const checks = [];
  for (const task of pending) {
    let facts = shadowed(task.facts, task.statements, context);
    for (const statement of task.statements) {
      const flow = statementFlow(statement, facts, context);
      checks.push(...flow.checks);
      pending.push(...flow.children.filter(({ statements }) => statements.length > 0));
      facts = flow.after;
    }
  }
  return checks;
}
