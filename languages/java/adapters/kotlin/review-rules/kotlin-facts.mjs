import { readKotlinReport } from './kotlin-report.mjs';

const NULLABLE = /\?$/u;
const GENERIC_ARGUMENTS = /<.*$/u;

export function readKotlinFacts(reportRoot) {
  const { files } = readKotlinReport(reportRoot);
  return { files: files.filter(({ skipped }) => skipped !== true) };
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
