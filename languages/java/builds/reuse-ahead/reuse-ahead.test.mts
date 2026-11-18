import type { ChildProcess } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  computeReusePart,
  jvmReuseAhead,
  launchReuseProcess,
  startReuseAhead,
  takeReuseAhead,
} from './reuse-ahead.mts';
import { REQUEST_FILE, RESULT_FILE } from './reuse-files.mts';
import { reuseRequest } from './reuse-request.mts';
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
});
