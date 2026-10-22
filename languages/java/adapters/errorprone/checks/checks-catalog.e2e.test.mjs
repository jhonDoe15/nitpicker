import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHECKS, documentedChecks } from './checks-docs.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const roots = [];
const ROUTE_KEPT = 'ERROR checks that keep the exceptions route';

function errorProneClasspath() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-errorprone-catalog-'));
  roots.push(root);
  writeFileSync(path.join(root, 'settings.gradle'), "rootProject.name = 'catalog'\n");
  writeFileSync(
    path.join(root, 'build.gradle'),
    `plugins { id 'java' }
repositories { mavenCentral() }
dependencies {
    runtimeOnly 'com.google.errorprone:error_prone_core:${CHECKS.reviewed.errorProne}'
    runtimeOnly 'com.uber.nullaway:nullaway:${CHECKS.reviewed.nullAway}'
}
tasks.register('classpath') {
    def files = configurations.runtimeClasspath
    doLast { file('classpath.txt').text = files.files*.absolutePath.join(File.pathSeparator) }
}
`,
  );
  const result = spawnSync(gradle, ['--console=plain', '--quiet', 'classpath'], {
    cwd: root,
    encoding: 'utf8',
  });
  expect(result.stderr).not.toMatch(/FAILURE/u);
  return readFileSync(path.join(root, 'classpath.txt'), 'utf8');
}

function jarCheckers(classpath) {
  const lister = path.join(import.meta.dirname, 'BugCheckers.java');
  const result = spawnSync('java', ['-cp', classpath, lister], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout
    .trim()
    .split('\n')
    .map((line) => line.split('\t'))
    .map(([name, severity, state, names]) => ({ name, severity, state, names: names.split(',') }));
}

const sorted = (names) => [...new Set(names)].sort();

afterAll(() => {
  if (roots.length > 0) {
    spawnSync(gradle, ['--stop'], { cwd: roots[0], encoding: 'utf8' });
  }
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('checks.json against the pinned Error Prone jar', () => {
  it('reviews exactly the jar checks, and every list names checks in the state it assumes', () => {
    const classpath = errorProneClasspath();
    const checkers = jarCheckers(classpath);
    const byName = new Map(checkers.map((checker) => [checker.name, checker]));
    const isOn = ({ name, state }) =>
      CHECKS.enable.includes(name) || (state === 'on' && !CHECKS.disable.includes(name));
    const on = checkers.filter((checker) => isOn(checker));
    const onNames = on.map(({ name }) => name);
    const onErrors = on.filter((checker) => checker.severity === 'ERROR').map(({ name }) => name);
    const stateOf = (names) => names.map((name) => byName.get(name)?.state);

    expect(
      path.basename(classpath.split(path.delimiter).find((jar) => /nullaway/u.test(jar))),
    ).toBe(`nullaway-${CHECKS.reviewed.nullAway}.jar`);
    expect(CHECKS.reviewedChecks).toStrictEqual(sorted(checkers.map(({ name }) => name)));
    expect(new Set(stateOf(CHECKS.enable))).toStrictEqual(new Set(['off']));
    expect(new Set(stateOf(CHECKS.disable))).toStrictEqual(new Set(['on']));
    expect(CHECKS.lombokUnsuppressedOff.filter((name) => !onNames.includes(name))).toStrictEqual(
      [],
    );
    expect(CHECKS.certainBugs.filter((name) => !onErrors.includes(name))).toStrictEqual([]);
    expect(sorted([...CHECKS.certainBugs, ...documentedChecks(ROUTE_KEPT)])).toStrictEqual(
      sorted(onErrors),
    );
    expect(CHECKS.suppressible).toStrictEqual(sorted(on.flatMap(({ names }) => names)));
  }, 180_000);
});
