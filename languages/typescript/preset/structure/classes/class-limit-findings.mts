import { readFileSync } from 'node:fs';
import type TypeScript from 'typescript';
import type { Finding } from '../../../adapters/static-checks/shared.mts';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import { readHeadPolicy, readLayout } from '../typed/rule-views.mts';
import { measureClasses, type ClassMeasure } from './class-measures.mts';
import { fileFacts, resolveBase, type FileFacts } from './class-links.mts';
import { classLimitFindings, containedPath } from './class-views.mts';

const ts = typescriptApi();

function parse(projectRoot: string, file: string): TypeScript.SourceFile {
  const absolute = containedPath(projectRoot, file);
  return ts.createSourceFile(
    absolute,
    readFileSync(absolute, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function depthOf(entry: ClassMeasure, facts: ReadonlyMap<string, FileFacts>): number {
  const chain = new Set([entry]);
  for (const current of chain) {
    const parent = resolveBase(current, facts);
    if (parent !== undefined) {
      chain.add(parent);
    }
  }
  return [...chain].filter((link) => link.extends !== undefined).length;
}

export function typescriptClassLimitFindings(
  projectRoot: string,
  analyzerName: string,
  environment: NodeJS.ProcessEnv,
): Finding[] {
  const layout = readLayout(environment);
  const policy = readHeadPolicy(environment);
  const parsed = layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isSourceFile(file))
    .map((file) => ({ file, sourceFile: parse(projectRoot, file) }))
    .map(({ file, sourceFile }) => ({
      sourceFile,
      source: containedPath(projectRoot, file),
      classes: measureClasses(sourceFile, [file, containedPath(projectRoot, file)]),
    }));
  const facts = new Map(
    parsed.map(({ source, sourceFile, classes }) => [source, fileFacts(sourceFile, classes)]),
  );
  const measured = parsed
    .flatMap(({ classes }) => classes)
    .map((entry) => ({ ...entry, inheritanceDepth: depthOf(entry, facts) }));
  return classLimitFindings(measured, {
    analyzerName,
    thresholds: policy.thresholds,
    exceptions: policy.exceptions,
  });
}
