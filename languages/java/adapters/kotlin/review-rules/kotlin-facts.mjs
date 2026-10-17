import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FACTS_REPORT = 'kotlin-facts.json';
const NULLABLE = /\?$/u;
const GENERIC_ARGUMENTS = /<.*$/u;

export function readKotlinFacts(reportRoot) {
  const report = path.join(reportRoot, FACTS_REPORT);
  return existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : { files: [] };
}

export function simpleTypeName(type) {
  const bare = (type ?? '').replaceAll(/\s+/gu, '').replace(NULLABLE, '').replace(GENERIC_ARGUMENTS, '');
  return bare.split('.').at(-1);
}

export function insideClass(owner, qualified) {
  return owner === qualified || owner.startsWith(`${qualified}.`);
}

export function annotationNamed(annotations, names) {
  return annotations.some((annotation) => names.has(annotation.name ?? annotation));
}

export function importsFrom(file, prefix) {
  return file.imports.some(({ path: imported }) => imported.startsWith(prefix));
}

export function factsOf(facts, { tests }) {
  return facts.files.filter((file) => file.test === tests);
}
