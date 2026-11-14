import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gradleStages } from '../../adapters/gradle-wrapper/gradle-stages.mts';
import { INIT_SCRIPT } from '../java-build.mjs';
import {
  PIT_HISTORY_DIRECTORY,
  pitHistoryArguments,
  pitHistoryOf,
  pitHistoryProperties,
} from './pit-history.mjs';

const roots = [];
const BUILD = { 'pom.xml': '<project/>', 'lib/build.gradle': "plugins { id 'java' }" };

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, files) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

function snapshots(headFiles = BUILD, baseFiles = BUILD) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pit-history-'));
  roots.push(root);
  const base = path.join(root, 'base');
  const head = path.join(root, 'head');
  write(base, baseFiles);
  write(head, headFiles);
  return { base, head };
}

function recordedFile(projectRoot, module) {
  return path.join(projectRoot, module, 'target', PIT_HISTORY_DIRECTORY, 'test.history');
}

function record(base, module) {
  write(base, { [path.relative(base, recordedFile(base, module))]: '0\n' });
}

function headPolicy(base) {
  return { snapshot: 'head', baselineRoot: base };
}

describe('pitHistoryProperties', () => {
  it('records the history on the base side', () => {
    expect(pitHistoryProperties({ snapshot: 'base', baselineRoot: '/b' }, '/p')).toEqual([
      '-Pnitpicker.pit.recordHistory=true',
    ]);
  });

  it('points the head side at the base snapshot', () => {
    const { base, head } = snapshots();

    expect(pitHistoryProperties(headPolicy(base), head)).toEqual([
      `-Pnitpicker.pit.historyRoot=${base}`,
    ]);
  });

  it.each([
    ['a dependency in a build script', { 'lib/build.gradle': "plugins { id 'java-library' }" }],
    ['a version catalog', { 'gradle/libs.versions.toml': '[versions]' }],
    ['a resource', { 'lib/src/main/resources/application.properties': 'a=1' }],
    ['a test resource', { 'lib/src/test/resources/data.json': '{}' }],
  ])('runs every mutant when the change edits %s', (_, edit) => {
    const { base, head } = snapshots({ ...BUILD, ...edit });

    expect(pitHistoryProperties(headPolicy(base), head)).toEqual([]);
  });

  it('reuses the history when only sources and other files change', () => {
    const edited = { 'lib/src/main/java/demo/A.java': 'class A {}', 'README.md': 'new' };
    const { base, head } = snapshots({ ...BUILD, ...edited });

    expect(pitHistoryProperties(headPolicy(base), head)).toEqual([
      `-Pnitpicker.pit.historyRoot=${base}`,
    ]);
  });

  it('ignores the build output of either side', () => {
    const output = { 'lib/build/resources/main/generated.properties': 'stamp=1' };
    const { base, head } = snapshots({ ...BUILD, ...output });

    expect(pitHistoryProperties(headPolicy(base), head)).toEqual([
      `-Pnitpicker.pit.historyRoot=${base}`,
    ]);
  });

  it.each([[{ snapshot: 'head' }], [{}], [undefined]])(
    'leaves a run with no base snapshot alone: %j',
    (policy) => {
      expect(pitHistoryProperties(policy, '/p')).toEqual([]);
    },
  );

  it.each(['head', 'base'])('reaches the Gradle run that mutates on %s', (snapshot) => {
    const { base, head } = snapshots();
    const [stage] = gradleStages([], {
      projectRoot: head,
      initScript: 'init.gradle',
      policy: { snapshot, baselineRoot: base },
      directory: path.join(head, 'gradle'),
    });

    expect(stage().filter((argument) => argument.startsWith('-Pnitpicker.pit.'))).toEqual([
      snapshot === 'head'
        ? `-Pnitpicker.pit.historyRoot=${base}`
        : '-Pnitpicker.pit.recordHistory=true',
    ]);
  });
});

describe('pitHistoryArguments', () => {
  it('writes the base history into the module build directory', () => {
    const history = pitHistoryOf({ snapshot: 'base', baselineRoot: '/b' }, '/p');

    expect(pitHistoryArguments(history, '/p/lib/target')).toEqual([
      '--historyOutputLocation',
      recordedFile('/p', 'lib'),
    ]);
  });

  it('reads the history the base side wrote for the same module', () => {
    const { base, head } = snapshots();
    record(base, 'lib');
    const history = pitHistoryOf(headPolicy(base), head);

    expect(pitHistoryArguments(history, path.join(head, 'lib', 'target'))).toEqual([
      '--historyInputLocation',
      recordedFile(base, 'lib'),
    ]);
  });

  it('runs every mutant when the change edits the build', () => {
    const { base, head } = snapshots({
      ...BUILD,
      'pom.xml': '<project><version>2</version></project>',
    });
    record(base, 'lib');
    const history = pitHistoryOf(headPolicy(base), head);

    expect(pitHistoryArguments(history, path.join(head, 'lib', 'target'))).toEqual([]);
  });

  it('names the same history directory as the Gradle init script', () => {
    const recordedName = `file("${PIT_HISTORY_DIRECTORY}/\${source.name}.history")`;

    expect(readFileSync(INIT_SCRIPT, 'utf8').includes(recordedName)).toBe(true);
  });

  it('ignores a module whose build directory lies outside the base snapshot', () => {
    const { base, head } = snapshots();
    const outside = path.join(path.dirname(base), 'elsewhere');
    write(outside, { [path.join(PIT_HISTORY_DIRECTORY, 'test.history')]: '0\n' });
    const history = pitHistoryOf(headPolicy(base), head);

    expect(pitHistoryArguments(history, outside)).toEqual([]);
  });

  it('runs every mutant when the base side recorded nothing for the module', () => {
    const { base, head } = snapshots();
    const history = pitHistoryOf(headPolicy(base), head);

    expect(pitHistoryArguments(history, path.join(head, 'app', 'target'))).toEqual([]);
  });

  it.each([
    ['no history settings', undefined, '/p/target'],
    ['no build directory', pitHistoryOf({ snapshot: 'base' }, '/p'), undefined],
    ['a run outside a comparison', pitHistoryOf({}, '/p'), '/p/target'],
  ])('passes nothing with %s', (_, history, buildDirectory) => {
    expect(pitHistoryArguments(history, buildDirectory)).toEqual([]);
  });
});
