import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SourceFile } from '../../spring/typed/spring-shapes.mts';
import type { FanOutFinding } from './typed/fan-out-types.mts';
import { fieldOf, listOf } from '../../../../../../../shared/values/readers.mts';
import { expect } from 'vitest';
import { fanOutFindings } from './fan-out.mts';

type FactFile = SourceFile;

export type { FanOutFinding };

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures');
const FACT_FILES = {
  'kotlin-fan-out': path.join(FIXTURES, 'kotlin-fan-out-facts.json'),
  'kotlin-reactive-fan-out': path.join(FIXTURES, 'kotlin-reactive-fan-out-facts.json'),
};

function isFactFile(value: unknown): value is FactFile {
  return typeof fieldOf(value, 'file') === 'string';
}

function factFiles(name: keyof typeof FACT_FILES): FactFile[] {
  const parsed: unknown = JSON.parse(readFileSync(FACT_FILES[name], 'utf8'));
  return listOf(fieldOf(parsed, 'files')).filter(isFactFile);
}

export const UNBOUNDED = 'src/main/kotlin/shop/Unbounded.kt';
export const BOUNDED = 'src/main/kotlin/shop/Bounded.kt';

type FileCoverage = {
  reported: (string | undefined)[];
  expected: (string | undefined)[];
  unbounded: FanOutFinding[];
  bounded: FanOutFinding[];
  boundedFunctions: number;
};

type FixtureProject = {
  files: FactFile[];
  coverage: (all: FanOutFinding[], reported: FanOutFinding[]) => FileCoverage;
  lineOf: (file: string, fragment: string) => number;
  run: (own?: FactFile[]) => { findings: FanOutFinding[]; calls: Set<string> };
  findingAt: (all: FanOutFinding[], fragment: string) => FanOutFinding | undefined;
};

function sourceLines(project: string, file: string): string[] {
  const full = path.resolve(project, file);
  if (!full.startsWith(project + path.sep)) {
    throw new Error(`${file} is outside the fixture project`);
  }
  return readFileSync(full, 'utf8').split('\n');
}

export function fixtureProject(
  projectName: string,
  name: keyof typeof FACT_FILES,
  pattern: RegExp,
): FixtureProject {
  const project = path.join(FIXTURES, projectName);
  const files = factFiles(name);

  function functionAt(file: string, line: number): string | undefined {
    const lines = sourceLines(project, file).slice(0, line).toReversed();
    return lines.map((text) => pattern.exec(text)?.[1]).find(Boolean);
  }

  function publicFunctions(file: string): (string | undefined)[] {
    return sourceLines(project, file)
      .filter((text) => !text.includes('private fun'))
      .map((text) => pattern.exec(text)?.[1])
      .filter((name) => name !== undefined);
  }

  function lineOf(file: string, fragment: string): number {
    return sourceLines(project, file).findIndex((text) => text.includes(fragment)) + 1;
  }

  function run(own: FactFile[] = files): { findings: FanOutFinding[]; calls: Set<string> } {
    return fanOutFindings({ own, projectFiles: files, projectRoot: project, javaRoots: [] });
  }

  function findingAt(all: FanOutFinding[], fragment: string): FanOutFinding | undefined {
    return all.find(({ location }) => location.line === lineOf(UNBOUNDED, fragment));
  }

  function coverage(all: FanOutFinding[], reported: FanOutFinding[]): FileCoverage {
    return {
      reported: reported.map(({ path: file, location }) => functionAt(file, location.line)),
      expected: publicFunctions(UNBOUNDED),
      unbounded: inFile(all, UNBOUNDED),
      bounded: inFile(all, BOUNDED),
      boundedFunctions: publicFunctions(BOUNDED).length,
    };
  }

  return { files, coverage, lineOf, run, findingAt };
}

function inFile(all: FanOutFinding[], file: string): FanOutFinding[] {
  return all.filter(({ path: found }) => found === file);
}

export function stableIdentities(findings: FanOutFinding[], after: FanOutFinding[]): boolean {
  const before = new Set(findings.map(({ identity }) => identity));
  return (
    after.length === findings.length - 1 && after.every(({ identity }) => before.has(identity))
  );
}

export function enforceable(rule: string, message: string, line: number): unknown {
  const anyText: unknown = expect.any(String);
  return {
    tool: 'kotlin-source',
    rule,
    path: UNBOUNDED,
    identity: anyText,
    message,
    classification: 'enforceable',
    location: { line },
  };
}
