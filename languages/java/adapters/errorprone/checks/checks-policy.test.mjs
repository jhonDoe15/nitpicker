import { describe, expect, it } from 'vitest';
import { readPinnedTools } from '../../../builds/java-build.mjs';
import { toolDependencies } from '../../../maven/maven-tools.mjs';
import { CHECKS, documentedChecks } from './checks-docs.mjs';

const OFF = 'Checks that are off';
const ROUTE_KEPT = 'ERROR checks that keep the exceptions route';
const SPARED = 'Checks spared in annotated classes';
const LISTS = [
  'reviewedChecks',
  'enable',
  'disable',
  'defaultOff',
  'certainBugs',
  'lombokUnsuppressedOff',
];

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
    expect(LISTS.map((name) => CHECKS[name])).toStrictEqual(
      LISTS.map((name) => [...new Set(CHECKS[name])].sort()),
    );
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

  it('lists as off exactly the checks that the table of checks that are off documents', () => {
    expect([...CHECKS.disable, ...CHECKS.defaultOff].sort()).toStrictEqual(
      documentedChecks(OFF).sort(),
    );
    expect(CHECKS.defaultOff.filter((name) => CHECKS.enable.includes(name))).toStrictEqual([]);
  });

  it('documents why each ERROR check outside certainBugs keeps the exceptions route', () => {
    const routeKept = documentedChecks(ROUTE_KEPT);

    expect(routeKept).toStrictEqual([...new Set(routeKept)].sort());
    expect(routeKept.filter((name) => CHECKS.certainBugs.includes(name))).toStrictEqual([]);
    expect(routeKept.filter((name) => !CHECKS.reviewedChecks.includes(name))).toStrictEqual([]);
    expect(CHECKS.certainBugs.filter((name) => CHECKS.disable.includes(name))).toStrictEqual([]);
  });

  it('spares only reviewed, documented checks in classes with sorted, unrepeated annotations', () => {
    const exempted = Object.keys(CHECKS.classExemptions);

    expect(exempted).toStrictEqual([...new Set(exempted)].sort());
    expect(exempted.filter((name) => !CHECKS.reviewedChecks.includes(name))).toStrictEqual([]);
    expect(documentedChecks(SPARED)).toStrictEqual(exempted);
    const annotationLists = Object.values(CHECKS.classExemptions);
    expect(annotationLists).toStrictEqual(
      annotationLists.map((annotations) => [...new Set(annotations)].sort()),
    );
  });
});
