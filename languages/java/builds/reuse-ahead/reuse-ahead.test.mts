import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  computeReusePart,
  jvmReuseAhead,
  launchReuseProcess,
  startReuseAhead,
  takeReuseAhead,
} from './reuse-ahead.mts';
import {
  REQUEST_FILE,
  RESULT_FILE,
  readJsonFile,
  reusePartOf,
  writeJsonFile,
} from './reuse-files.mts';
import { reuseRequest } from './reuse-request.mts';
import type { ReusePart } from '../../adapters/reuse/jvm-reuse-types.mts';
import { fieldOf } from '../../../../shared/values/readers.mts';
import {
  createReuseProjects,
  JAVA_ROOT,
  SINGLE_PROJECT,
} from '../../adapters/reuse/test-support/reuse-projects.mts';

const { project } = createReuseProjects();

const RULES = `package shop;

public class Rules {
  String size(int count) {
    if (count > 10) { return "many"; }
    if (count > 20) { return "lots"; }
    return "few";
  }

  private static String clean(String value) {
    return value.trim().toLowerCase();
  }
  public String label(String value) { return clean(value); }
}
`;
const COPY = `package shop.copy;

public class Copy {
  private static String clean(String value) {
    return value.trim().toLowerCase();
  }
  public String label(String value) { return clean(value); }
}
`;
const RULES_FILE = `${JAVA_ROOT}/shop/Rules.java`;

function reuseProject(): string {
  return project({ [RULES_FILE]: RULES, [`${JAVA_ROOT}/shop/copy/Copy.java`]: COPY });
}

function failingLaunch(folder: string): ChildProcess {
  writeFileSync(path.join(folder, REQUEST_FILE), '{');
  return launchReuseProcess(folder);
}

function requestFor(root: string): string {
  return reuseRequest(root, { projects: SINGLE_PROJECT, kotlin: false, policy: {} });
}

function rules(part: { readonly findings: readonly { readonly rule: string }[] } | undefined) {
  return part?.findings.map(({ rule }) => rule).toSorted();
}

describe('reuse facts computed ahead in a child process', () => {
  it('reads back what the run computes in-process', () => {
    const request = requestFor(reuseProject());

    startReuseAhead(request);
    const ahead = takeReuseAhead(request);

    expect(ahead).toEqual(computeReusePart(request));
    expect(rules(ahead)).toEqual([
      'decided-condition',
      'duplicate-definition',
      'duplicate-definition',
    ]);
  });

  it('falls back to computing in-process when the child fails, with the same findings', () => {
    const root = reuseProject();
    const request = requestFor(root);
    const options = { projects: SINGLE_PROJECT, kotlin: false, policy: {} };
    startReuseAhead(request);
    const fromChild = jvmReuseAhead(root, options);
    startReuseAhead(request, failingLaunch);

    expect(takeReuseAhead(request)).toBeUndefined();

    startReuseAhead(request, failingLaunch);
    expect(jvmReuseAhead(root, options)).toEqual(fromChild);
  });

  it('drops a result whose sources changed after the child read them', async () => {
    const root = reuseProject();
    const request = requestFor(root);
    const folders: string[] = [];
    startReuseAhead(request, (folder) => {
      folders.push(folder);
      return launchReuseProcess(folder);
    });
    await vi.waitFor(
      () => {
        expect(existsSync(path.join(folders[0] ?? '', RESULT_FILE))).toBe(true);
      },
      { timeout: 60_000, interval: 50 },
    );
    writeFileSync(path.join(root, RULES_FILE), RULES.replace('count > 20', 'count > 5'));

    expect(takeReuseAhead(request)).toBeUndefined();
  });

  it('ignores a run started for other inputs', () => {
    const root = reuseProject();
    startReuseAhead(requestFor(root));

    expect(
      takeReuseAhead(reuseRequest(root, { projects: SINGLE_PROJECT, kotlin: true, policy: {} })),
    ).toBeUndefined();
  });

  it('streams empty and populated reuse parts in pieces and reads them back intact', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-reuse-pieces-'));
    try {
      const emptyPart: ReusePart = {
        findings: [],
        entryFindings: [],
        usage: { modules: [], packages: [], imports: [] },
      };
      const emptyFile = path.join(folder, 'empty.json');
      writeJsonFile(emptyFile, { stamps: {}, part: emptyPart });
      expect(reusePartOf(fieldOf(readJsonFile(emptyFile), 'part'))).toEqual(emptyPart);

      const populatedPart: ReusePart = {
        findings: Array.from({ length: 300 }, (_, index) => ({
          tool: 'structure',
          rule: 'duplicate-definition',
          path: `src/main/java/shop/Item${String(index)}.java`,
          line: index + 1,
          message: `Duplicate helper ${String(index)}`,
        })),
        entryFindings: [
          {
            tool: 'entry-points',
            rule: 'public-alternative-bypass',
            path: 'src/main/kotlin/shop/Use.kt',
            line: 3,
            message: 'Use the public alias',
          },
        ],
        usage: {
          modules: Array.from({ length: 300 }, (_, index) => ({
            file: `src/main/java/shop/Item${String(index)}.java`,
            role: 'production',
          })),
          packages: [{ root: '', published: false }],
          imports: Array.from({ length: 300 }, (_, index) => ({
            from: `src/main/java/shop/Item${String(index)}.java`,
            to: 'src/main/java/shop/Shared.java',
            names: [{ name: 'Shared' }],
          })),
        },
      };
      const populatedFile = path.join(folder, 'populated.json');
      writeJsonFile(populatedFile, {
        stamps: { 'src/main/java/shop/Item0.java': 'abc123' },
        part: populatedPart,
      });
      const lineCount = readFileSync(populatedFile, 'utf8').split('\n').length;
      expect(lineCount).toBeGreaterThan(300);
      const parsed = readJsonFile(populatedFile);
      expect(fieldOf(parsed, 'stamps')).toEqual({ 'src/main/java/shop/Item0.java': 'abc123' });
      expect(reusePartOf(fieldOf(parsed, 'part'))).toEqual(populatedPart);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
