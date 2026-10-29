import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';

const EXPOSURE_RULES = ['EI_EXPOSE_REP', 'EI_EXPOSE_REP2'];
const MAX_ANCESTORS = 12;
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const VERSION_ANNOTATION = /@\s*(?:[\w.]*\.)?Version\b/;

function escapeRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function blank(text) {
  return text.replaceAll(/[^\n]/g, ' ');
}

function readSource(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').replaceAll(COMMENTS, blank) : undefined;
}

function isAssociation(source, field) {
  return new RegExp(
    String.raw`@\s*(?:[\w.]*\.)?(?:ManyToOne|OneToOne)\b[^;{}]*?\b${escapeRegExp(field)}\s*[;=]`,
  ).test(source);
}

function exposedField(result) {
  const [, field] = result.message?.arguments ?? [];
  return typeof field === 'string' ? field.split('.').at(-1) : undefined;
}

export function dropEntityAssociations(log, projectRoot) {
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).filter((result) => {
        const field = exposedField(result);
        const uri = result.locations?.[0]?.physicalLocation?.artifactLocation?.uri;
        if (!EXPOSURE_RULES.includes(result.ruleId) || field === undefined || uri === undefined) {
          return true;
        }
        const source = readSource(path.join(projectRoot, uri));
        return source === undefined || !isAssociation(source, field);
      }),
    })),
  };
}

export function withExposureAdvice(finding) {
  return EXPOSURE_RULES.includes(finding.rule)
    ? {
        ...finding,
        message: `${finding.message}. Copy on the way in and out (List.copyOf, Map.copyOf), or use a record. An exception fits only when it is right here.`,
      }
    : finding;
}

function javaFilesUnder(projectRoot, sourceRoots) {
  return sourceRoots.flatMap((root) =>
    projectFilesUnder(path.join(projectRoot, root)).filter((file) => file.endsWith('.java')),
  );
}

function classIndex(projectRoot, sourceRoots) {
  const index = new Map();
  for (const file of javaFilesUnder(projectRoot, sourceRoots)) {
    const name = path.basename(file, '.java');
    index.set(name, [...(index.get(name) ?? []), file]);
  }
  return index;
}

function superclassOf(source, className) {
  const declaration = new RegExp(
    String.raw`\bclass\s+${escapeRegExp(className)}\b(?:\s*<[^{]*?>)?\s+extends\s+([\w.]+)`,
  );
  return declaration.exec(source)?.[1].split('.').at(-1);
}

function suppliesVersion(index, superclass) {
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

function superclassAfter(source, line) {
  const after = source
    .split('\n')
    .slice(line - 1)
    .join('\n');
  return /\bclass\s+\w+\b(?:\s*<[^{]*?>)?\s+extends\s+([\w.]+)/.exec(after)?.[1].split('.').at(-1);
}

export function dropInheritedVersions(findings, { projectRoot, sourceRoots }) {
  let index;
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
    index ??= classIndex(projectRoot, sourceRoots);
    return !suppliesVersion(index, superclass);
  });
}
