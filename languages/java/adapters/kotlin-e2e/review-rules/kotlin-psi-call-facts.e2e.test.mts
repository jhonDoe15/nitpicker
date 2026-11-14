import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listOf } from '../../../../../scripts/json/fields.mts';
import { fieldOf, textOf } from '../../../../../shared/values/readers.mts';
import { assigned } from '../test-support/views/assigned.mts';
import {
  compilePsiProgram,
  gradleClasspath,
  pinnedKotlinCompiler,
  writeSources,
} from '../test-support/views/kotlin-psi-views.mts';
import { findingFactory as untypedFindingFactory } from '../../kotlin/review-rules/review-finding.mjs';
import { unusedOptionFindings as untypedUnusedOptionFindings } from '../../kotlin/review-rules/main/unused-options/unused-options.mjs';
import { forwardingWrapperFindings as untypedForwardingWrapperFindings } from '../../kotlin/review-rules/main/forwarding/forwarding-wrappers.mjs';

type Identified = { identity: string }[];

const findingFactory: () => unknown = untypedFindingFactory;
const unusedOptionFindings: (
  files: unknown,
  options: { finding: unknown; mentionedInJava: () => boolean },
) => Identified = untypedUnusedOptionFindings;
const forwardingWrapperFindings: (files: unknown, options: { finding: unknown }) => Identified =
  untypedForwardingWrapperFindings;

const enabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';

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

let workspace: string | undefined;
let java: string | undefined;
let classpath: string | undefined;
let classes: string | undefined;

function fileEnding(files: unknown, suffix: string): unknown {
  return listOf(files).find((entry) => textOf(fieldOf(entry, 'file')).endsWith(suffix));
}

function factsOf(project: string): unknown {
  const facts = path.join(project, 'facts.json');
  const result = spawnSync(
    path.join(assigned(java, 'java'), 'bin/java'),
    [
      `-Dnitpicker.kotlinCompiler=${String(pinnedKotlinCompiler())}`,
      '-cp',
      `${assigned(classpath, 'classpath')}${path.delimiter}${assigned(classes, 'classes')}`,
      'nitpicker.kotlinpsi.KotlinPsi',
      path.join(project, 'metrics.json'),
      facts,
      project,
      'src',
    ],
    { cwd: project, encoding: 'utf8', timeout: 180_000 },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return fieldOf(JSON.parse(readFileSync(facts, 'utf8')), 'files');
}

describe.skipIf(!enabled)('the call facts of the kotlin-psi program', () => {
  let files: unknown;

  beforeAll(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-calls-'));
    const project = path.join(workspace, 'project');
    cpSync(path.resolve(import.meta.dirname, '../../fixtures/kotlin-project'), project, {
      recursive: true,
    });
    const compiler = gradleClasspath({ gradle, project, workspace });
    java = compiler.javaHome;
    classpath = compiler.classpath;
    classes = compilePsiProgram({ java, classpath, workspace });
    files = factsOf(
      writeSources(workspace, 'calls', {
        'src/demo/text/Text.kt': TEXT,
        'src/demo/app/App.kt': APP,
      }),
    );
  });

  afterAll(() => {
    rmSync(assigned(workspace, 'workspace'), { recursive: true, force: true });
  });

  it('records the receiver of a call and how an inline function passes its lambdas', () => {
    const app = fileEnding(files, 'App.kt');
    const text = fileEnding(files, 'Text.kt');
    const inlining = (name: string) =>
      listOf(
        fieldOf(
          listOf(fieldOf(text, 'functions')).find((fn) => fieldOf(fn, 'name') === name),
          'parameters',
        ),
      ).map((parameter) => fieldOf(parameter, 'inlining'));

    expect(
      fieldOf(
        listOf(fieldOf(app, 'calls')).find((call) => fieldOf(call, 'name') === 'pad'),
        'qualifier',
      ),
    ).toBe('name');
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
