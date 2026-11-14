import { describe, expect, it } from 'vitest';
import { proveSource } from '../test-support/prove.mjs';

const RUN = `
    const header = request.headers.get(name);
    const parts = header.split(SEPARATOR, LIMIT);
    const token = decode(parts[1], options.encoding);
    audit.record(token, header, request.id);`;

function functions(first, second) {
  return `function first(request, options, name) {${first}\n}\nfunction second(request, options, name) {${second}\n}`;
}

describe('partly shared statement runs', () => {
  it('finds a shared run between functions that differ around it', () => {
    const finding = proveSource(
      functions(
        `\n    prepare(request);${RUN}\n    return token.subject;`,
        `\n    if (options.strict) { reject(request, 'strict'); }${RUN}\n    return token.issuer;`,
      ),
    );

    expect(finding.verdict).toBe('partial-run');
    expect(finding.run).toEqual([
      { start: 3, end: 6 },
      { start: 11, end: 14 },
    ]);
  });

  it('finds a run nested at different depths in the two functions', () => {
    const finding = proveSource(
      functions(
        `\n    if (options.enabled) {${RUN}\n      return token.subject;\n    }\n    return null;`,
        `\n    log(request, name);${RUN}\n    send(token, options.target, request.id, name);`,
      ),
    );

    expect(finding.verdict).toBe('partial-run');
  });

  it('declines a run when two of its values are used after it', () => {
    const finding = proveSource(
      functions(
        `\n    prepare(request);${RUN}\n    return [token.subject, parts.length];`,
        `\n    if (options.strict) { reject(request, 'strict'); }${RUN}\n    return [token.issuer, parts.length];`,
      ),
    );

    expect(finding?.verdict).not.toBe('partial-run');
  });

  it('declines a run that returns from inside it', () => {
    const exiting = RUN.replace(
      'audit.record',
      'if (token === null) { return null; }\n    audit.record',
    );
    const finding = proveSource(
      functions(
        `\n    prepare(request);${exiting}\n    return token.subject;`,
        `\n    if (options.strict) { reject(request, 'strict'); }${exiting}\n    return token.issuer;`,
      ),
    );

    expect(finding?.verdict).not.toBe('partial-run');
  });

  it('declines a run that breaks out of the loop around it', () => {
    const loop = (body) =>
      `\n    for (const entry of request.entries) {${body}\n    }\n    return options;`;
    const verdictWith = (run) =>
      proveSource(
        functions(
          loop(`\n    prepare(entry);${run}`),
          loop(`\n    if (options.strict) { reject(entry, name); }${run}`),
        ),
      )?.verdict;
    const inner = RUN.replace(
      'audit.record',
      'for (const part of parts) { if (part === null) { break; } }\n    audit.record',
    );
    const outer = RUN.replace('audit.record', 'if (token === null) { break; }\n    audit.record');

    expect(verdictWith(inner)).toBe('partial-run');
    expect(verdictWith(outer)).not.toBe('partial-run');
  });

  it('counts a value the run writes and the loop reads before it on the next pass', () => {
    const run = `
      total = total + weigh(entry, options.scale);
      const label = describe(entry, total);
      audit.record(label, entry.id, name);
      metrics.observe(label, total, options.unit);`;
    const sides = [
      ['prepare(total);', 'send(label);'],
      ['if (options.strict) { reject(total, name); }', 'queue.push(label, name);'],
    ];
    const straight = ([before, after]) =>
      `\n    let total = 0;\n    const entry = request.first;\n    ${before}${run}\n    ${after}`;
    const loop = ([before, after]) =>
      `\n    let total = 0;\n    for (const entry of request.entries) {\n      ${before}${run}\n      ${after}\n    }`;

    expect(proveSource(functions(...sides.map(straight))).verdict).toBe('partial-run');
    expect(proveSource(functions(...sides.map(loop)))?.verdict).not.toBe('partial-run');
  });

  it.each([
    ['two values', 'b', undefined],
    ['one value', 'c', 'partial-run'],
  ])(
    'counts %s the run carries to its next pass, read before it writes them',
    (_, name, verdict) => {
      const run = `
      a = advance(a, b, options.width, options.height, name);
      ${name} = refine(a, b, options.format, options.locale, name);
      trace(a, ${name}, options.limit, options.offset, name);`;
      const finding = proveSource(
        functions(
          `\n    let a = start(request); let b = 0; let c = 0;\n    while (request.open) {${run}\n    }\n    close(request);`,
          `\n    let c = 2; let b = 1; let a = other(options, 3);\n    if (options.enabled) { while (request.open) {${run}\n    } }\n    return b;`,
        ),
      );

      expect(finding?.verdict).toBe(verdict);
    },
  );

  it('spans a run from its first line to its last when the canonical order moves a statement', () => {
    const loop = `
    const toRemove = new BitSet();
    for (let i = 0; i < array.length; i++) {
      const count = occurrences.get(array[i]);
      if (count != null) {
        if (count.decrementAndGet() === 0) {
          occurrences.delete(array[i]);
        }
        toRemove.set(i);
      }
    }`;
    const finding = proveSource(
      functions(
        `
    const occurrences = new Map();
    for (const v of request) { increment(occurrences, Boolean(v)); }${loop}
    return removeAt(request, toRemove);`,
        `
    const occurrences = new Map(request.length);
    for (const v of request) { increment(occurrences, v); }${loop}
    return toArray(removeAt(request, toRemove), name);`,
      ),
    );

    expect(finding.verdict).toBe('partial-run');
    expect(finding.run.every(({ start, end }) => start <= end)).toBe(true);
  });
});
