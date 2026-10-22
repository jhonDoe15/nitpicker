import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FACTS_REPORT = 'kotlin-facts.json';
const NULLABLE = /\?$/u;
const GENERIC_ARGUMENTS = /<.*$/u;

function readReport(reportRoot) {
  const report = path.join(reportRoot, FACTS_REPORT);
  return existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : { files: [] };
}

export function readKotlinFacts(reportRoot) {
  const { files } = readReport(reportRoot);
  return { files: files.filter(({ skipped }) => skipped !== true) };
}

export function readKotlinDesign(reportRoot) {
  return readReport(reportRoot).design;
}

export function append(map, key, value) {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
}

export function compactType(type) {
  return (type ?? '').replaceAll(/\s+/gu, '');
}

export function bareType(type) {
  return compactType(type).replace(NULLABLE, '');
}

export function simpleTypeName(type) {
  return bareType(type).replace(GENERIC_ARGUMENTS, '').split('.').at(-1);
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
