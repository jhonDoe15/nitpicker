const withDefaults = (tool, fixture, rows) =>
  rows.map(([rule, mention]) => ({
    name: `${rule} names "${mention}"`,
    fixture,
    tool,
    rule,
    mention,
  }));

export const ruffCases = (fixture, rows) => withDefaults('ruff', fixture, rows);
export const rulesCases = (fixture, rows) => withDefaults('python-rules', fixture, rows);

export const everyRule = (rules, mention) => rules.map((rule) => [rule, mention]);
