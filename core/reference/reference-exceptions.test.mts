import { describe, expect, it } from 'vitest';
import { validateConfig } from '../configuration/validate.mts';
import { fieldOf, textOf } from '../../shared/values/readers.mts';
import { exceptionFor, presetsOf, readReferenceEntries } from './reference-views.mts';
import type { RuleEntry, RuleException } from './reference-views.mts';

const PLACEHOLDER = /<[^>]+>/u;

function concreteRule(entry: RuleEntry, rule: string) {
  if (!PLACEHOLDER.test(rule)) {
    return rule;
  }
  const sample = entry.samples?.[0];
  if (sample === undefined) {
    return undefined;
  }
  return rule.startsWith(`${entry.tool}/`) ? sample : sample.slice(entry.tool.length + 1);
}

function exceptionEntry(entry: RuleEntry, exception: RuleException) {
  return {
    rule: concreteRule(entry, exception.rule),
    paths: ['src/main/module.file'],
    reason: 'Reviewed.',
    ...(exception.function === true || exception.functionRequired === true
      ? { function: 'run' }
      : {}),
    ...(exception.name === true ? { name: 'value' } : {}),
    ...(exception.packages === true ? { packages: ['org.example'] } : {}),
  };
}

function configOf(preset: string, key: string | undefined, exception: object) {
  return key === 'python.exceptions'
    ? { preset, python: { exceptions: [exception] } }
    : { preset, exceptions: [exception] };
}

function routes() {
  return readReferenceEntries().flatMap((entry) =>
    presetsOf(entry).flatMap((preset) => {
      const exception = exceptionFor(entry, preset);
      return exception === undefined ? [] : [{ entry, preset, exception }];
    }),
  );
}

function rejection(config: object) {
  try {
    validateConfig(structuredClone(config));
    return undefined;
  } catch (error) {
    return textOf(fieldOf(error, 'message'));
  }
}

describe('the exceptions the rule reference advises', () => {
  const advised = routes();

  it('covers every entry that has an exception in some preset', () => {
    expect(advised.length).toBeGreaterThan(0);
    expect(
      advised
        .filter(({ entry, exception }) => concreteRule(entry, exception.rule) === undefined)
        .map(({ entry, preset }) => `${entry.id} (${preset})`),
    ).toEqual([]);
  });

  it('are accepted by the config validation in each preset the entry names', () => {
    const rejected = advised
      .map(({ entry, preset, exception }) => {
        const config = configOf(preset, exception.key, exceptionEntry(entry, exception));
        const problem = rejection(config);
        return problem === undefined ? undefined : `${entry.id} (${preset}): ${problem}`;
      })
      .filter((problem) => problem !== undefined);
    expect(rejected).toEqual([]);
  });
});
