import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isReviewCheck,
  isSafeCheck,
  LEFT_OUT_CHECKS,
  patchChecks,
  REVIEW_CHECKS,
  SAFE_CHECKS,
} from './error-prone-checks.mjs';
import { ownChecksOf } from '../own/own-checks.mjs';

const CHECKS = JSON.parse(
  readFileSync(new URL('../../../gradle/errorprone/checks.json', import.meta.url), 'utf8'),
);
const LISTED = [...SAFE_CHECKS, ...REVIEW_CHECKS, ...LEFT_OUT_CHECKS];

describe('the Error Prone fix lists', () => {
  it('keeps the three lists apart', () => {
    expect(LISTED.filter((check, index) => LISTED.indexOf(check) !== index)).toEqual([]);
  });

  it('lists only checks of the reviewed Error Prone version', () => {
    const reviewed = new Set(CHECKS.reviewedChecks);

    expect(LISTED.filter((check) => !reviewed.has(check))).toEqual([]);
  });

  it('never lists a check the preset turns off', () => {
    const off = new Set([...CHECKS.disable, ...CHECKS.defaultOff]);

    expect([...SAFE_CHECKS, ...REVIEW_CHECKS].filter((check) => off.has(check))).toEqual([]);
  });

  it('covers the checks that emit a fix', () => {
    expect(LISTED.length).toBeGreaterThan(360);
  });

  it.each([
    ['MissingOverride', true, false],
    ['ClassCanBeStatic', false, true],
    ['MissingDefault', false, false],
  ])('tells %s apart by list: safe %s, review %s', (check, safe, review) => {
    expect([isSafeCheck(check), isReviewCheck(check)]).toEqual([safe, review]);
  });
});

describe('patchChecks', () => {
  it('uses the safe list and the safe own checks when no rule is selected', () => {
    expect(patchChecks([])).toEqual([...SAFE_CHECKS, ...ownChecksOf('safe')]);
  });

  it('adds an own check when the rule it fixes is selected', () => {
    expect(
      patchChecks(['pmd/PreserveStackTrace', 'errorprone/MissingOverride', 'pmd/Nope']),
    ).toEqual(['MissingOverride', 'PreserveStackTrace']);
  });

  it('uses the selected Error Prone checks that have a fix, and nothing else', () => {
    expect(
      patchChecks([
        'errorprone/ClassCanBeStatic',
        'errorprone/MissingOverride',
        'errorprone/MissingDefault',
        'errorprone/Nope',
        'checkstyle/UpperEll',
      ]),
    ).toEqual(['ClassCanBeStatic', 'MissingOverride']);
  });

  it('runs no compile when the selection names no Error Prone check', () => {
    expect(patchChecks(['checkstyle/UpperEll'])).toEqual([]);
  });
});
