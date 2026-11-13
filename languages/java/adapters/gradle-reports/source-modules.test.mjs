import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readModuleJacoco, withoutExcludedFiles } from './report-modules.mjs';

const finding = (file) => ({ tool: 'detekt', rule: 'MagicNumber', path: file });

describe('the files a Gradle build excludes from its Kotlin source sets', () => {
  it('drops the findings on an excluded file of any project and keeps the others', () => {
    const modules = [
      { manifest: { kotlinExcludedFiles: ['app/src/main/kotlin/Gen.kt'] } },
      { manifest: { kotlinExcludedFiles: ['lib/src/test/kotlin/Old.kt'] } },
      { manifest: {} },
    ];
    const findings = [
      finding('app/src/main/kotlin/Gen.kt'),
      finding('lib/src/test/kotlin/Old.kt'),
      finding('app/src/main/kotlin/Main.kt'),
      finding('.'),
    ];

    expect(withoutExcludedFiles(findings, modules)).toEqual([
      finding('app/src/main/kotlin/Main.kt'),
      finding('.'),
    ]);
  });

  it('keeps every finding when no project excludes a file', () => {
    const findings = [finding('src/main/kotlin/Main.kt')];

    expect(withoutExcludedFiles(findings, [{ manifest: { kotlinExcludedFiles: [] } }])).toBe(
      findings,
    );
  });
});

describe('the coverage of an Android or Multiplatform project', () => {
  it('is not read when the build wrote none', () => {
    const module = { reportRoot: '/missing', manifest: { kotlinSourceModule: true } };

    expect(readModuleJacoco(module, 'kotlin')).toBeUndefined();
  });
});

describe('the coverage of a Multiplatform project with a JVM target', () => {
  it('is read from the report the build wrote', () => {
    const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-source-module-'));
    writeFileSync(path.join(reportRoot, 'jacoco.xml'), '<report/>');

    expect(readModuleJacoco({ reportRoot, manifest: { kotlinSourceModule: true } }, 'kotlin')).toBe(
      '<report/>',
    );
    rmSync(reportRoot, { recursive: true, force: true });
  });
});
