import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { collectJavaFindings } from '../../../adapters/java-diff.mts';
import { HOSTED_TOOLS } from '../config/host-config.mts';
import { HOSTS_OFF_VARIABLE, TRACE_VARIABLE } from '../config/host-environment.config.mts';

const TEST_TIMEOUT_MS = 180_000;
const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const maven = process.env['NITPICKER_MAVEN'];
const adapters = path.resolve(import.meta.dirname, '../../../adapters/fixtures');
const fixtures = path.resolve(import.meta.dirname, '../../../maven/fixtures');
type Modules = readonly (readonly [string, string])[];
const JAVA_MODULES: Modules = [
  ['guards-project', 'guards'],
  ['effects-project', 'effects'],
  ['guards-project', 'guards-again'],
];
const KOTLIN_MODULES: Modules = [
  ['kotlin-project', 'kotlin'],
  ['kotlin-project', 'kotlin-again'],
];
const KOTLIN_TOOLS = ['io.gitlab.arturbosch.detekt.cli.Main', 'nitpicker.kotlinpsi.KotlinPsi'];
const parent = (modules: Modules): string => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>hosts</groupId><artifactId>parent</artifactId><version>1</version>
  <packaging>pom</packaging>
  <modules>${modules.map(([, name]) => `<module>${name}</module>`).join('')}</modules>
</project>
`;
const VOLATILE = /(?:^|\/)(?:test-results|nitpicker-lint|work)(?:\/|$)/u;
const JVM_NOTICE = /^(?:NOTE: )?Picked up /u;
const WORK_DIRECTORY = /\/tmp\/nitpicker-maven-\w+/gu;
const SECONDS = /in \d+(?:\.\d+)?s/gu;
const TIMESTAMP = /timestamp="[^"]*"/gu;
const KOTLIN_MAIN = `package demo

class Library(private val names: List<String>) {
    fun greet(index: Int): String {
        val name = names[index]
        if (name.isEmpty()) {
            return "nobody"
        }
        return "hello " + name
    }

    fun unused( value : Int ) = value+1
}
`;
const KOTLIN_TEST = `package demo

import kotlin.test.Test
import kotlin.test.assertEquals

class LibraryTest {
    @Test
    fun greets() {
        assertEquals("hello a", Library(listOf("a")).greet(0))
    }
}
`;
const base = mkdtempSync(path.join(tmpdir(), 'nitpicker-hosts-'));

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

function project(modules: Modules, name: string): string {
  const root = path.join(base, name);
  mkdirSync(root);
  writeFileSync(path.join(root, 'pom.xml'), parent(modules));
  for (const [sources, name] of modules) {
    const module = path.join(root, name);
    if (sources === 'kotlin-project') {
      for (const [file, text] of [
        ['src/main/kotlin/demo/Library.kt', KOTLIN_MAIN],
        ['src/test/kotlin/demo/LibraryTest.kt', KOTLIN_TEST],
      ] as const) {
        mkdirSync(path.dirname(path.join(module, file)), { recursive: true });
        writeFileSync(path.join(module, file), text);
      }
    } else {
      cpSync(path.join(adapters, sources), module, { recursive: true });
    }
    for (const stale of [
      'build.gradle',
      'settings.gradle',
      'build.gradle.kts',
      'settings.gradle.kts',
    ]) {
      rmSync(path.join(module, stale), { force: true });
    }
    cpSync(path.join(fixtures, sources.split('-')[0] ?? ''), module, { recursive: true });
    const pom = path.join(module, 'pom.xml');
    writeFileSync(
      pom,
      readFileSync(pom, 'utf8').replace(
        /<artifactId>[^<]*<\/artifactId>/u,
        `<artifactId>${name}</artifactId>`,
      ),
    );
  }
  return root;
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedKeys);
  }
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value)
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, sortedKeys(item)]),
      )
    : value;
}

function normalized(text: string, root: string, name: string): string {
  const canonical = name.endsWith('.json') ? JSON.stringify(sortedKeys(JSON.parse(text))) : text;
  return canonical
    .replaceAll(root, '<root>')
    .split('\n')
    .filter((line) => !JVM_NOTICE.test(line))
    .join('\n')
    .replaceAll(WORK_DIRECTORY, '<work>')
    .replaceAll(SECONDS, 'in <seconds>')
    .replaceAll(TIMESTAMP, 'timestamp="<time>"');
}

function reports(root: string, modules: Modules): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name] of modules) {
    const directory = path.join(root, name, 'target/nitpicker');
    for (const file of readdirSync(directory, { recursive: true, withFileTypes: true })) {
      const full = path.join(file.parentPath, file.name);
      const key = path.relative(root, full).replaceAll('\\', '/');
      if (file.isFile() && !VOLATILE.test(key)) {
        found[key] = normalized(readFileSync(full, 'utf8'), root, file.name);
      }
    }
  }
  return found;
}

function analyze(root: string, hosted: boolean, trace: string, preset: string): unknown {
  vi.stubEnv(HOSTS_OFF_VARIABLE, hosted ? undefined : '1');
  vi.stubEnv(TRACE_VARIABLE, hosted ? trace : undefined);
  try {
    return collectJavaFindings(root, { maven, policy: { quick: true, preset } });
  } finally {
    vi.unstubAllEnvs();
  }
}

type Parity = {
  readonly fresh: { readonly reports: Record<string, string>; readonly findings: unknown };
  readonly hosted: { readonly reports: Record<string, string>; readonly findings: unknown };
  readonly trace: readonly string[];
};

function parity(modules: Modules, preset: string): Parity {
  const root = project(modules, preset);
  const trace = path.join(root, 'trace.log');
  const freshFindings = analyze(root, false, trace, preset);
  const freshReports = reports(root, modules);
  for (const [, name] of modules) {
    rmSync(path.join(root, name, 'target'), { recursive: true, force: true });
  }
  const hostedFindings = analyze(root, true, trace, preset);
  return {
    fresh: { reports: freshReports, findings: freshFindings },
    hosted: { reports: reports(root, modules), findings: hostedFindings },
    trace: existsSync(trace) ? readFileSync(trace, 'utf8').split('\n') : [],
  };
}

function hostedEvery(trace: readonly string[], tools: readonly string[], modules: Modules) {
  return tools.map(
    (tool) => trace.filter((line) => line === `hosted ${tool}`).length >= modules.length,
  );
}

function otherOutcomes(trace: readonly string[]): string[] {
  return trace.filter((line) => line !== '' && !line.startsWith('hosted '));
}

describe.skipIf(!enabled)('the shared tool JVMs', () => {
  it(
    'write the reports of fresh JVMs for Java modules run back to back, and host the tools',
    () => {
      const javaTools = Object.keys(HOSTED_TOOLS).filter((tool) => !KOTLIN_TOOLS.includes(tool));
      const tools = [...javaTools, 'javac', 'jdeps'];
      const run = parity(JAVA_MODULES, 'java');

      expect(run.hosted.reports).toEqual(run.fresh.reports);
      expect(run.hosted.findings).toEqual(run.fresh.findings);
      expect(hostedEvery(run.trace, tools, JAVA_MODULES)).toEqual(tools.map(() => true));
      expect(otherOutcomes(run.trace)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'write the reports of fresh JVMs for Kotlin modules, and host detekt and the PSI reader',
    () => {
      const run = parity(KOTLIN_MODULES, 'kotlin');

      expect(run.hosted.reports).toEqual(run.fresh.reports);
      expect(run.hosted.findings).toEqual(run.fresh.findings);
      expect(hostedEvery(run.trace, KOTLIN_TOOLS, KOTLIN_MODULES)).toEqual(
        KOTLIN_TOOLS.map(() => true),
      );
      expect(otherOutcomes(run.trace)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
