import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEFT_OUT_CHECKS, REVIEW_CHECKS, SAFE_CHECKS } from '../checks/error-prone-checks.mjs';
import {
  OWN_CHECKS,
  OWN_CHECKS_DIRECTORY,
  ownCheck,
  ownChecksOf,
  ownRule,
  usesOwnChecks,
} from './own-checks.mjs';

const SOURCES = path.join(OWN_CHECKS_DIRECTORY, 'nitpicker', 'fix');
const SERVICES = path.join(
  OWN_CHECKS_DIRECTORY,
  'META-INF',
  'services',
  'com.google.errorprone.bugpatterns.BugChecker',
);
const NAMES = OWN_CHECKS.map(({ check }) => check);

describe('the own fix checks', () => {
  it('have one Java class each, registered as Error Prone services', () => {
    const classes = readdirSync(SOURCES)
      .filter((name) => name.endsWith('.java') && name !== 'Support.java')
      .map((name) => name.replace(/\.java$/u, ''));
    const services = readFileSync(SERVICES, 'utf8').split('\n').filter(Boolean);

    expect(classes.toSorted()).toEqual(NAMES.toSorted());
    expect(services.toSorted()).toEqual(NAMES.map((name) => `nitpicker.fix.${name}`).toSorted());
  });

  it('never reuse the name of a check of Error Prone', () => {
    const builtIn = new Set([...SAFE_CHECKS, ...REVIEW_CHECKS, ...LEFT_OUT_CHECKS]);

    expect(NAMES.filter((name) => builtIn.has(name))).toEqual([]);
  });

  it('are named after the rule they fix, which keeps the finding of PMD or Checkstyle', () => {
    expect(NAMES.map((name) => ownRule(name))).toEqual(
      OWN_CHECKS.map(({ check, tool }) => ({ tool, rule: check })),
    );
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });

  it('split into safe and review checks', () => {
    expect([...ownChecksOf('safe'), ...ownChecksOf('review')].toSorted()).toEqual(NAMES.toSorted());
    expect(ownCheck('RetryInTest').safety).toBe('review');
    expect(ownCheck('LiteralsFirstInComparisons').safety).toBe('review');
    expect(ownCheck('SpringComposedMapping').safety).toBe('safe');
    expect(ownCheck('MissingOverride')).toBeUndefined();
  });

  it('are recognised among the checks of a patch run', () => {
    expect(usesOwnChecks(['MissingOverride', 'PreserveStackTrace'])).toBe(true);
    expect(usesOwnChecks(['MissingOverride'])).toBe(false);
  });
});
