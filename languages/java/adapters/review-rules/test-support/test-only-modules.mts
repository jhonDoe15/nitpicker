import path from 'node:path';
import { writeFiles } from '../../../../../core/diff/git/test-support/fixture-files.mts';

export type Pair = readonly [string, string];
type Found = {
  readonly path: string;
  readonly identity?: string | undefined;
  readonly location?: { readonly line: number } | undefined;
};

type ModuleProject = {
  readonly reportRoot: string;
  readonly qualifier: string;
  readonly sourceRoots: readonly string[];
  readonly kotlinSourceRoots: readonly string[];
  readonly resourceRoots: readonly string[];
};

function edge([from, to]: Pair): string {
  return `   ${from} -> ${to} not found\n`;
}

export function module(
  root: string,
  qualifier: string,
  options: {
    readonly classes: readonly string[];
    readonly main?: readonly Pair[];
    readonly tests?: readonly Pair[];
    readonly traits?: readonly ('published' | 'kotlin')[];
    readonly resourceRoots?: readonly string[];
  },
): ModuleProject {
  const { classes, main = [], tests = [], traits = [] } = options;
  const reportRoot = path.join(root, '.reports', qualifier || 'root');
  writeFiles(reportRoot, {
    'jdeps-classes.txt': classes.map((name) => `${name}\n`).join(''),
    'jdeps.txt': main.map(edge).join(''),
    'jdeps-test.txt': tests.map(edge).join(''),
    'manifest.json': JSON.stringify({ published: traits.includes('published') }),
  });
  const prefix = qualifier === '' ? '' : `${qualifier}/`;
  return {
    reportRoot,
    qualifier,
    sourceRoots: [`${prefix}src/main/java`],
    kotlinSourceRoots: traits.includes('kotlin') ? [`${prefix}src/main/kotlin`] : [],
    resourceRoots: options.resourceRoots ?? [`${prefix}src/main/resources`],
  };
}

export function source(name: string, body = ''): string {
  return `package shop;\n\npublic class ${name} {${body}}\n`;
}

export function summary(findings: readonly Found[]): string[] {
  return findings.map(
    ({ path: file, identity, location }) => `${file}:${String(location?.line)} ${String(identity)}`,
  );
}
