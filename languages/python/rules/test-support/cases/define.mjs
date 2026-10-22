function withDefaults(tool, fixture, rows) {
  return rows.map(([rule, mention]) => ({
    name: `${rule} names "${mention}"`,
    fixture,
    tool,
    rule,
    mention,
  }));
}

export function ruffCases(fixture, rows) {
  return withDefaults('ruff', fixture, rows);
}

export function rulesCases(fixture, rows) {
  return withDefaults('python-rules', fixture, rows);
}

export function everyRule(rules, mention) {
  return rules.map((rule) => [rule, mention]);
}
