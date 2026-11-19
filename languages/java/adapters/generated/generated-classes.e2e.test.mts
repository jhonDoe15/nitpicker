import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { handWrittenClasses } from '../../maven/generated/spotbugs-targets.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';

describe.skipIf(!enabled)('GeneratedClasses, the class list SpotBugs analyzes', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-generated-classes-'));

  afterAll(() => {
    rmSync(work, { recursive: true, force: true });
  });

  function put(file: string, text = ''): void {
    mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    writeFileSync(path.join(work, file), text);
  }

  it('keeps the classes of written sources and drops what generated sources declare', () => {
    put(
      'target/generated-sources/gen/p/Api.java',
      'package p;\npublic class Api { class Inner {} }\nclass Helper {}\nenum Kind { A }\n',
    );
    put(
      'target/generated-sources/gen/p/Fields.kt',
      'package p\n\ndata class Fields(val a: Int)\nobject Registry\n',
    );
    put('target/generated-sources/gen/p/Mixed.java', 'package p;\npublic class Mixed {}\n');
    put('src/main/java/p/Hand.java', 'package p;\npublic class Hand { class Inner {} }\n');
    put('src/main/java/p/Mixed$Part.java', 'package p;\nclass Mixed$Part {}\n');
    const classes = [
      ...['Api', 'Api$Inner', 'Api$Inner$1', 'Helper', 'Kind', 'Kind$1', 'Fields', 'FieldsKt'],
      ...['Registry', 'Hand', 'Hand$Inner', 'Mixed', 'Mixed$Part', 'ApiClient'],
    ];
    for (const name of classes) {
      put(`target/classes/p/${name}.class`);
    }
    const reportDir = path.join(work, 'reports');
    mkdirSync(reportDir, { recursive: true });
    const written = path.join(work, 'src/main/java');
    const module = {
      basedir: work,
      buildDirectory: path.join(work, 'target'),
      outputDirectory: path.join(work, 'target/classes'),
      sourceRoots: [written, path.join(work, 'target/generated-sources/gen')],
    };

    const targets = handWrittenClasses({ module, reportDir });
    const kept = readFileSync(targets?.list ?? '', 'utf8')
      .trim()
      .split('\n')
      .map((file) => path.basename(file, '.class'));
    const plain = handWrittenClasses({ module: { ...module, sourceRoots: [written] }, reportDir });

    expect(targets?.empty).toBe(false);
    expect(kept.sort()).toEqual(['ApiClient', 'Hand', 'Hand$Inner', 'Mixed$Part'].sort());
    expect(plain).toBeUndefined();
  });
});
