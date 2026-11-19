import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder as filesUnder } from '../../../../shared/project-files/project-files.mjs';
import type { JavaFinding } from '../typed/java-values.mts';
import type { JpaFilterOptions, SarifLog, SarifResult, SourceIndex } from './jpa-types.mts';

const projectFilesUnder: (root: string) => string[] = filesUnder;

const EXPOSURE_RULES = ['EI_EXPOSE_REP', 'EI_EXPOSE_REP2'];
const MAX_ANCESTORS = 12;
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const VERSION_ANNOTATION = /@\s*(?:[\w.]*\.)?Version\b/;

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function blank(text: string): string {
  return text.replaceAll(/[^\n]/g, ' ');
}

export function readSource(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8').replaceAll(COMMENTS, blank) : undefined;
}

function isAssociation(source: string, field: string): boolean {
  return new RegExp(
    String.raw`@\s*(?:[\w.]*\.)?(?:ManyToOne|OneToOne)\b[^;{}]*?\b${escapeRegExp(field)}\s*[;=]`,
  ).test(source);
}

function exposedField(result: SarifResult): string | undefined {
  const [, field] = result.message?.arguments ?? [];
  return typeof field === 'string' ? field.split('.').at(-1) : undefined;
}

export function keepResults(log: SarifLog, keep: (result: SarifResult) => boolean): SarifLog {
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).filter(keep),
    })),
  };
}

export function dropEntityAssociations(log: SarifLog, projectRoot: string): SarifLog {
  return keepResults(log, (result) => {
    const field = exposedField(result);
    const uri = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
    if (!EXPOSURE_RULES.includes(result.ruleId ?? '') || field === undefined || uri === undefined) {
      return true;
    }
    const source = readSource(path.join(projectRoot, uri));
    return source === undefined || !isAssociation(source, field);
  });
}

function javaFilesUnder(projectRoot: string, sourceRoots: readonly string[]): string[] {
  return sourceRoots.flatMap((root) =>
    projectFilesUnder(path.join(projectRoot, root)).filter((file) => file.endsWith('.java')),
  );
}

export function classIndex(projectRoot: string, sourceRoots: readonly string[]): SourceIndex {
  const index: SourceIndex = new Map();
  for (const file of javaFilesUnder(projectRoot, sourceRoots)) {
    const name = path.basename(file, '.java');
    index.set(name, [...(index.get(name) ?? []), file]);
  }
  return index;
}

export function superclassOf(source: string, className: string): string | undefined {
  const declaration = new RegExp(
    String.raw`\bclass\s+${escapeRegExp(className)}\b(?:\s*<[^{]*?>)?\s+extends\s+([\w.]+)`,
  );
  return declaration.exec(source)?.[1]?.split('.').at(-1);
}

function suppliesVersion(index: SourceIndex, superclass: string): boolean {
  const pending = [superclass];
  for (const name of pending) {
    const sources = (index.get(name) ?? []).map((file) => readSource(file) ?? '');
    if (sources.some((source) => VERSION_ANNOTATION.test(source))) {
      return true;
    }
    const parent = sources.map((source) => superclassOf(source, name)).find(Boolean);
    if (parent !== undefined && pending.length < MAX_ANCESTORS) {
      pending.push(parent);
    }
  }
  return false;
}

function superclassAfter(source: string, line: number): string | undefined {
  const after = source
    .split('\n')
    .slice(line - 1)
    .join('\n');
  return /\bclass\s+\w+(?:\s*<[^{]*?>)?\s+extends\s+([\w.]+)/.exec(after)?.[1]?.split('.').at(-1);
}

export function dropInheritedVersions(
  findings: readonly JavaFinding[],
  { projectRoot, sourceRoots }: JpaFilterOptions,
): JavaFinding[] {
  let index: SourceIndex | undefined;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== 'JpaVersion') {
      return true;
    }
    const source = readSource(path.join(projectRoot, finding.path));
    const superclass =
      source === undefined ? undefined : superclassAfter(source, finding.location?.line ?? 1);
    if (superclass === undefined) {
      return true;
    }
    index ??= classIndex(projectRoot, sourceRoots ?? []);
    return !suppliesVersion(index, superclass);
  });
}
