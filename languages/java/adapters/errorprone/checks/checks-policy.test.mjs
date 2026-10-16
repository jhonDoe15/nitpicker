import { describe, expect, it } from 'vitest';
import { readPinnedTools } from '../../../builds/java-build.mjs';
import { toolDependencies } from '../../../maven/maven-tools.mjs';
import { CHECKS, documentedChecks } from './checks-docs.mjs';

const OFF = 'Checks that are off';
const ROUTE_KEPT = 'ERROR checks that keep the exceptions route';
const LISTS = ['reviewedChecks', 'enable', 'disable', 'certainBugs', 'lombokUnsuppressedOff'];

describe('Error Prone check policy', () => {
  it('was reviewed for the Error Prone and NullAway versions both builds run', () => {
    const pinned = readPinnedTools();
    const reviewed = { errorProne: pinned.errorProne, nullAway: pinned.nullAway };
    const maven = toolDependencies(pinned).errorprone.map((dependency) =>
      /<artifactId>([^<]+)<\/artifactId><version>([^<]+)</u.exec(dependency).slice(1),
    );

    expect(CHECKS.reviewed).toStrictEqual(reviewed);
    expect(maven).toStrictEqual([
      ['error_prone_core', reviewed.errorProne],
      ['nullaway', reviewed.nullAway],
    ]);
  });

  it('names only reviewed checks, and keeps each list sorted and free of repeats', () => {
    for (const name of LISTS) {
      expect(CHECKS[name]).toStrictEqual([...new Set(CHECKS[name])].sort());
    }
    const unreviewed = LISTS.slice(1).flatMap((name) =>
      CHECKS[name].filter((check) => !CHECKS.reviewedChecks.includes(check)),
    );
    expect(unreviewed).toStrictEqual([]);
  });

  it('documents a reason for every check it turns off, and documents no check it turns on', () => {
    const offList = documentedChecks(OFF);

    expect(CHECKS.disable.filter((name) => !offList.includes(name))).toStrictEqual([]);
    expect(offList.filter((name) => CHECKS.enable.includes(name))).toStrictEqual([]);
  });

  it('documents why each ERROR check outside certainBugs keeps the exceptions route', () => {
    const routeKept = documentedChecks(ROUTE_KEPT);

    expect(routeKept).toStrictEqual([...new Set(routeKept)].sort());
    expect(routeKept.filter((name) => CHECKS.certainBugs.includes(name))).toStrictEqual([]);
    expect(routeKept.filter((name) => !CHECKS.reviewedChecks.includes(name))).toStrictEqual([]);
    expect(CHECKS.certainBugs.filter((name) => CHECKS.disable.includes(name))).toStrictEqual([]);
  });
});
