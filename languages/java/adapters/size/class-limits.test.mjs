import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readClassLimitFindings } from './class-limits.mjs';
import {
  compiledMetrics,
  runMetrics,
} from '../structure-metrics/test-support/compiled-metrics.mjs';

const SOURCE_ROOT = 'src/main/java';

const SAMPLE = `package demo;

import java.util.List;
import static java.lang.Math.max;
import other.*;

public class Sample<T> extends Base<T> implements Runnable {
  private int first;
  private static int shared;
  int second, third;

  public Sample() {}

  public void run() {
    class Local {
      int inside;
      void work() {}
    }
    new Object() {
      int ignored;
      void alsoIgnored() {}
    };
  }

  public int getFirst() {
    return first;
  }

  interface Contract {
    int CONSTANT = 1;

    void one();

    void two();
  }

  enum Level {
    LOW,
    HIGH(2);

    private final int weight;

    Level() {
      weight = 0;
    }

    Level(int weight) {
      this.weight = weight;
    }

    int weight() {
      return weight;
    }
  }

  record Pair(int left, int right) {
    static int count;

    int sum() {
      return left + right;
    }
  }

  @interface Marker {
    int value();
  }

  static class Inner extends demo.Other {
    int one;
  }
}
`;

const CHAIN = {
  'Root.java': 'package demo;\npublic class Root extends Exception {}\n',
  'Mid.java': 'package demo;\npublic class Mid extends Root {}\n',
  'Leaf.java': 'package demo;\npublic class Leaf extends Mid {}\n',
  'Deep.java': 'package demo;\npublic class Deep extends Leaf {}\n',
};

const temporaryRoots = [];
let sample;

function projectWith(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-classes-')));
  temporaryRoots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, SOURCE_ROOT, 'demo', name)), { recursive: true });
    writeFileSync(path.join(root, SOURCE_ROOT, 'demo', name), text);
  }
  return root;
}

function measure(root) {
  const reportRoot = path.join(root, 'report');
  mkdirSync(reportRoot);
  const result = runMetrics(METRICS_CLASSES, {
    cwd: root,
    args: [
      path.join(reportRoot, 'structure.json'),
      path.join(reportRoot, 'classes.json'),
      root,
      SOURCE_ROOT,
    ],
  });
  return { ...result, reportRoot };
}

const METRICS_CLASSES = compiledMetrics();

beforeAll(() => {
  const root = projectWith({ 'Sample.java': SAMPLE, ...CHAIN });
  sample = { ...measure(root), root };
});

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('StructureMetrics.java classes report', () => {
  it('parses clean sources silently', () => {
    expect({ status: sample.status, stderr: sample.stderr }).toEqual({ status: 0, stderr: '' });
  });

  it('counts the methods, instance fields and superclass of every named type', () => {
    const report = JSON.parse(readFileSync(path.join(sample.reportRoot, 'classes.json'), 'utf8'));
    expect(
      Object.fromEntries(
        report.classes
          .filter(({ name }) => name.startsWith('Sample'))
          .map(({ name, kind, methods, fields, extends: parent }) => [
            name,
            { kind, methods, fields, ...(parent === undefined ? {} : { extends: parent }) },
          ]),
      ),
    ).toEqual({
      Sample: { kind: 'class', methods: 2, fields: 3, extends: 'Base' },
      'Sample.Local': { kind: 'class', methods: 1, fields: 1 },
      'Sample.Contract': { kind: 'interface', methods: 2, fields: 0 },
      'Sample.Level': { kind: 'enum', methods: 1, fields: 1 },
      'Sample.Pair': { kind: 'record', methods: 1, fields: 2 },
      'Sample.Marker': { kind: 'annotation', methods: 1, fields: 0 },
      'Sample.Inner': { kind: 'class', methods: 0, fields: 1, extends: 'demo.Other' },
    });
    const { start, file } = report.classes.find(({ name }) => name === 'Sample');
    expect({ start, file }).toEqual({ start: 7, file: `${SOURCE_ROOT}/demo/Sample.java` });
    expect(report.files[`${SOURCE_ROOT}/demo/Sample.java`]).toEqual({
      package: 'demo',
      imports: ['java.util.List', 'other.*'],
    });
  });

  it('prints the file, line and message of a syntax error and fails', () => {
    const root = projectWith({ 'Broken.java': 'package demo;\npublic class Broken {\n' });
    const result = measure(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      `StructureMetrics could not parse the sources:\n${SOURCE_ROOT}/demo/Broken.java:2: reached end of file while parsing\n`,
    );
  });
});

describe('readClassLimitFindings', () => {
  const find = (measured, thresholds, exceptions = []) =>
    readClassLimitFindings(measured.reportRoot, { thresholds, exceptions }).map(
      ({ rule, path: file, identity, message }) => ({
        rule,
        file,
        symbol: identity.split(':')[1],
        message,
      }),
    );

  it('reports a class over each limit by the superclasses it has in the project', () => {
    const found = find(sample, { inheritanceDepth: 3 });
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      rule: 'inheritance-depth-limit',
      symbol: 'Deep',
      file: `${SOURCE_ROOT}/demo/Deep.java`,
      message:
        'Class Deep extends 4 classes deep (limit 3). Hold the shared part as a field and delegate to it instead of extending. If a reviewer agrees this is intended, add {"rule":"inheritance-depth-limit","paths":["src/main/java/demo/Deep.java"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
    });
    expect(find(sample, { inheritanceDepth: 4 })).toEqual([]);
  });

  it('counts a library superclass and one it cannot resolve as one level', () => {
    const found = find(sample, { classMethods: 99, classFields: 99, inheritanceDepth: 0 });
    expect(found.map(({ symbol }) => symbol).toSorted()).toEqual([
      'Deep',
      'Leaf',
      'Mid',
      'Root',
      'Sample',
      'Sample.Inner',
    ]);
  });

  it('uses the defaults, takes thresholds and honours exceptions', () => {
    const wide = { inheritanceDepth: 9 };
    expect(find(sample, {}).map(({ rule }) => rule)).toEqual(['inheritance-depth-limit']);
    expect(find(sample, wide)).toEqual([]);
    expect(
      find(sample, { ...wide, classMethods: 1, classFields: 2 }).map(({ rule }) => rule),
    ).toEqual(['class-methods-limit', 'class-fields-limit', 'class-methods-limit']);
    expect(
      find(sample, { ...wide, classMethods: 1, classFields: 2 }, [
        { rule: 'class-methods-limit', paths: [`${SOURCE_ROOT}/**`] },
      ]).map(({ rule }) => rule),
    ).toEqual(['class-fields-limit']);
  });

  it('fails loudly, naming the step, without a report', () => {
    const missing = path.join(sample.root, 'missing');
    expect(() => readClassLimitFindings(missing, { thresholds: {} })).toThrow(
      `The classes.json report is missing from ${missing}: the structure step (StructureMetrics.java) did not write it, so the class limits cannot be checked`,
    );
  });
});
