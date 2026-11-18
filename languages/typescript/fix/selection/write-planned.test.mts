import { describe, expect, it } from 'vitest';
import {
  countFindings,
  judgeFindings,
  recipeRuns,
} from '../../../../core/fix/verify/judge-findings.mts';
import { newPassBudget, writeOutputs, type Reported } from './write-planned.mts';

const RULE = 'nitpicker/no-wasted-collection-step';
const NAME = 'src/a.ts';

type Entry = {
  readonly name: string;
  readonly recipe?: string;
  readonly fix: { readonly finding?: unknown; readonly alsoFixes?: readonly unknown[] };
};

function recordingWriter() {
  const entries: Entry[] = [];
  return {
    entries,
    apply(_snapshot: unknown, planned: readonly Entry[]) {
      entries.push(...planned);
      return { applied: planned.map(({ name }) => ({ name })), changedMeanwhile: [], errors: [] };
    },
  };
}

function reportOf(count: number, edit: { range: number[]; text: string }): Reported {
  const message = { ruleId: RULE, line: 1, suggestions: [{ fix: edit }] };
  return {
    name: NAME,
    output: undefined,
    messages: Array.from({ length: count }, () => message),
    fatal: false,
  };
}

function runsOf(entries: readonly Entry[]) {
  return recipeRuns(
    entries.map(({ recipe, fix }) => ({
      recipe,
      files: [NAME],
      finding: fix.finding as never,
      alsoFindings: (fix.alsoFixes ?? []) as never[],
    })),
  );
}

function twoPasses(firstCount: number) {
  const writer = recordingWriter();
  const settings = { selectedRules: [`eslint-lint/${RULE}`], writer } as never;
  const budget = newPassBudget();
  const first = new Map([[NAME, Buffer.from('f(await p);\n')]]);
  const second = new Map([[NAME, Buffer.from('f(p);\n')]]);
  writeOutputs(settings, first, [reportOf(firstCount, { range: [2, 8], text: '' })], budget);
  writeOutputs(settings, second, [reportOf(1, { range: [0, 1], text: 'g' })], budget);
  return writer.entries;
}

function finding() {
  return { tool: 'eslint-lint', rule: RULE, path: NAME, classification: 'enforceable' };
}

describe('writeOutputs over several passes of one rule', () => {
  it('records no more findings than the first pass reported', () => {
    const runs = runsOf(twoPasses(1));

    expect(runs.map(({ findings }) => findings.length)).toEqual([1]);
  });

  it('does not roll back a file whose one finding was fixed in two passes', () => {
    const runs = runsOf(twoPasses(1));
    const before = countFindings([finding()]);
    const after = countFindings([]);

    expect(judgeFindings({ runs, before, after, breaking: () => false }).size).toBe(0);
  });

  it('keeps the findings of a first pass that reported several', () => {
    const runs = runsOf(twoPasses(2));

    expect(runs.map(({ findings }) => findings.length)).toEqual([2]);
  });
});
