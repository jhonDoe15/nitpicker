import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../adapters/review-rules/java-sources.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../shared/values/readers.mts';
import type { Fields } from '../../../shared/values/readers.mts';

type ResultSite = { file: string; position: { line: number; column?: number } };
type Evidence = { text: (current: string) => string; subject: string };

const SUBJECT_KEY = 'nitpicker/subject';

export function factsReader<Facts>(
  projectRoot: string,
  build: (source: string) => Facts,
): (file: string) => Facts | undefined {
  const cache = new Map<string, Facts | undefined>();
  return (file) => {
    if (!cache.has(file)) {
      const full = pathInside(projectRoot, file);
      cache.set(file, existsSync(full) ? build(readFileSync(full, 'utf8')) : undefined);
    }
    return cache.get(file);
  };
}

function siteOf(result: unknown): ResultSite | undefined {
  const location = fieldOf(listOf(fieldOf(result, 'locations'))[0], 'physicalLocation');
  const file = fieldOf(fieldOf(location, 'artifactLocation'), 'uri');
  const region = fieldOf(location, 'region');
  const line = fieldOf(region, 'startLine');
  const column = fieldOf(region, 'startColumn');
  if (typeof file !== 'string' || typeof line !== 'number') {
    return undefined;
  }
  return { file, position: { line, ...(typeof column === 'number' ? { column } : {}) } };
}

export function withSubject(result: unknown, subject: string): Fields {
  return {
    ...fieldsOf(result),
    partialFingerprints: {
      ...fieldsOf(fieldOf(result, 'partialFingerprints')),
      [SUBJECT_KEY]: subject,
    },
  };
}

export function withEvidence(result: unknown, { text, subject }: Evidence): Fields {
  const message = fieldsOf(fieldOf(result, 'message'));
  return withSubject(
    { ...fieldsOf(result), message: { ...message, text: text(textOf(message['text'])) } },
    subject,
  );
}

function convertedRun(run: unknown, convert: (result: unknown) => unknown): Fields {
  return {
    ...fieldsOf(run),
    results: listOf(fieldOf(run, 'results')).map((item) => convert(item)),
  };
}

export function mapResults(log: Fields, convert: (result: unknown) => unknown): Fields {
  const runs = listOf(log['runs']).map((run) => convertedRun(run, convert));
  return { ...log, runs };
}

export function factsAt<Facts>(
  result: unknown,
  readFacts: (file: string) => Facts | undefined,
): { site: ResultSite; facts: Facts } | undefined {
  const site = siteOf(result);
  const facts = site === undefined ? undefined : readFacts(site.file);
  return site === undefined || facts === undefined ? undefined : { site, facts };
}
