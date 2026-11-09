import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  compilePsiProgram,
  gradleClasspath,
  pinnedKotlinCompiler,
  writeSources,
} from '../../test-support/kotlin-psi/kotlin-psi-program.mjs';
import { findingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { unusedOptionFindings } from '../../kotlin/review-rules/main/unused-options/unused-options.mjs';
import { forwardingWrapperFindings } from '../../kotlin/review-rules/main/forwarding-wrappers.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

const TEXT = `package demo.text

internal fun pad(text: String, width: Int = 4): String = text.padStart(width)

fun String.pad(width: Int): String = padStart(width)

fun label(value: Int): String = pad(value.toString())

fun checked(value: String): String = java.util.Objects.requireNonNull(value)

inline fun retrying(block: () -> Unit) = block()

inline fun later(crossinline block: () -> Unit) = Runnable { block() }
`;

const APP = `package demo.app

import demo.text.pad

fun title(name: String): String = name.pad(width = 12)
`;

let workspace;
let java;
let classpath;
let classes;

function factsOf(project) {
  const facts = path.join(project, 'facts.json');
  const result = spawnSync(
    path.join(java, 'bin/java'),
    [
      `-Dnitpicker.kotlinCompiler=${pinnedKotlinCompiler()}`,
      '-cp',
      `${classpath}${path.delimiter}${classes}`,
      'nitpicker.kotlinpsi.KotlinPsi',
      path.join(project, 'metrics.json'),
      facts,
      project,
      'src',
    ],
    { cwd: project, encoding: 'utf8', timeout: 180_000 },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return JSON.parse(readFileSync(facts, 'utf8')).files;
}

describe.skipIf(!enabled)('the call facts of the kotlin-psi program', () => {
  let files;

  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-calls-'));
    const project = path.join(workspace, 'project');
    cpSync(path.resolve(import.meta.dirname, '../../fixtures/kotlin-project'), project, {
      recursive: true,
    });
    ({ javaHome: java, classpath } = gradleClasspath({ gradle, project, workspace }));
    classes = compilePsiProgram({ java, classpath, workspace });
    files = factsOf(
      writeSources(workspace, 'calls', {
        'src/demo/text/Text.kt': TEXT,
        'src/demo/app/App.kt': APP,
      }),
    );
  });

  afterAll(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('records the receiver of a call and how an inline function passes its lambdas', () => {
    const app = files.find(({ file }) => file.endsWith('App.kt'));
    const text = files.find(({ file }) => file.endsWith('Text.kt'));
    const inlining = (name) =>
      text.functions
        .find((fn) => fn.name === name)
        .parameters.map((parameter) => parameter.inlining);

    expect(app.calls.find(({ name }) => name === 'pad').qualifier).toBe('name');
    expect([inlining('retrying'), inlining('later')]).toEqual([[undefined], ['crossinline']]);
  });

  it('does not count a call of a same-named extension as setting the option', () => {
    const finding = findingFactory();
    const found = unusedOptionFindings(files, { finding, mentionedInJava: () => false });

    expect(found.map(({ identity }) => identity)).toEqual(['unused-option:pad.width']);
  });

  it('reports a wrapper of a library function written with its package', () => {
    const found = forwardingWrapperFindings(files, { finding: findingFactory() });

    expect(found.map(({ identity }) => identity)).toEqual(['StaticForwardingWrapper:checked']);
  });
});
