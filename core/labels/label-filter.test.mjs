import { describe, expect, it } from 'vitest';
import {
  labelCountLine,
  labelLines,
  labelRun,
  labeledFindings,
  labeledOutcomes,
} from './label-filter.mts';

const LABELS = { perf: ['performance'], lint: ['style'], leak: ['reliability', 'async'] };
const labelsOf = ({ rule }) => LABELS[rule] ?? ['maintainability'];
const performance = { kinds: ['performance'], frameworks: [] };
const finding = (rule) => ({ tool: 't', rule });

describe('labeledFindings', () => {
  it('keeps the findings whose labels match and counts the rest', () => {
    expect(labeledFindings([finding('perf'), finding('lint')], performance, labelsOf)).toEqual({
      findings: [finding('perf')],
      hidden: 1,
    });
  });

  it('keeps everything without a filter', () => {
    expect(labeledFindings([finding('lint')], undefined, labelsOf)).toEqual({
      findings: [finding('lint')],
      hidden: 0,
    });
  });
});

describe('labeledOutcomes', () => {
  it('filters every list, recounts the tool and hides only new findings in the count', () => {
    const outcome = {
      tool: { name: 'eslint-lint', new: 2, resolved: 1, unchanged: 1, changedMetrics: 0 },
      result: {
        newFindings: [finding('perf'), finding('lint')],
        resolvedFindings: [finding('lint')],
        unchangedFindings: [finding('perf')],
        changedMetrics: [],
        extra: 'kept',
      },
    };

    const { outcomes, hidden } = labeledOutcomes([outcome], performance, labelsOf);

    expect(hidden).toBe(1);
    expect(outcomes[0].tool).toEqual({
      name: 'eslint-lint',
      new: 1,
      resolved: 0,
      unchanged: 1,
      changedMetrics: 0,
    });
    expect(outcomes[0].result).toEqual({
      newFindings: [finding('perf')],
      resolvedFindings: [],
      unchangedFindings: [finding('perf')],
      changedMetrics: [],
      extra: 'kept',
    });
  });
});

describe('labelRun', () => {
  it('says what the run left out and to finish without --label', () => {
    expect(labelRun({ kinds: ['bug'], frameworks: ['spring'] }, 3)).toEqual({
      labels: {
        selected: ['bug', 'spring'],
        hidden: 3,
        message:
          'Only findings labeled bug in spring code (3 findings with other labels hidden). ' +
          'Run nitpicker without --label before you finish.',
      },
    });
    expect(labelRun(performance, 1).labels.message).toBe(
      'Only findings labeled performance (1 finding with other labels hidden). ' +
        'Run nitpicker without --label before you finish.',
    );
    expect(labelRun(performance, 0).labels.message).toBe(
      'Only findings labeled performance. Run nitpicker without --label before you finish.',
    );
  });

  it('adds nothing without a filter', () => {
    expect(labelRun(undefined, 0)).toEqual({});
  });
});

describe('summary lines', () => {
  it('print the label message of a focused run', () => {
    expect(labelLines({ labels: { message: 'Only findings labeled bug.' } })).toEqual([
      'Only findings labeled bug.',
    ]);
    expect(labelLines({})).toEqual([]);
  });

  it('print the counts per label only for an unfocused run with two labels or more', () => {
    expect(labelCountLine({ labelCounts: { bug: 2, style: 5 } })).toEqual([
      '  by label: bug 2 · style 5 (focus with --label <label>)',
    ]);
    expect(labelCountLine({ labelCounts: { bug: 2 } })).toEqual([]);
    expect(labelCountLine({ labelCounts: { bug: 2, style: 5 }, labels: {} })).toEqual([]);
    expect(labelCountLine({})).toEqual([]);
  });
});
