export function code(strings, ...values) {
  const raw = strings.reduce((text, part, index) => `${text}${String(values[index - 1])}${part}`);
  const lines = raw
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^ */.exec(line)[0].length);
  const indent = Math.min(...indents);
  return `${lines.map((line) => line.slice(indent)).join('\n')}\n`;
}

export function fixture(
  name,
  { title, entry = 'payOrder', source, expect, bounds, oracle = true },
) {
  return {
    name,
    title,
    file: `reports/flow-model/fixtures/${name}.ts`,
    entry,
    source,
    bounds,
    oracle,
    expect: { reasons: [], violations: [], ...expect },
  };
}

export function applyEdits(text, edits) {
  let result = text;
  for (const [before, after] of edits) {
    const first = result.indexOf(before);
    if (first === -1 || result.indexOf(before, first + 1) !== -1) {
      throw new Error(
        `flow-model: seeded edit does not match exactly once: ${JSON.stringify(before)}`,
      );
    }
    result = result.replace(before, () => after);
  }
  return result;
}
