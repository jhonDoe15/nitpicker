import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FRAMEWORK_LABELS, isKind, isLabel } from '../../labels/taxonomy.mts';
import { upstreamLabelResolver } from './upstream-labels.mts';
import { textOf } from '../../../shared/values/readers.mts';

type Entry = Readonly<Record<string, unknown>>;

const TABLES = fileURLToPath(new URL('./tables/', import.meta.url));
const FRAMEWORKS = FRAMEWORK_LABELS.map(([label]) => label);

function tableFiles(root: string): string[] {
  const directories = [root];
  const files: string[] = [];
  for (const directory of directories) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      (item.isDirectory() ? directories : files).push(path.join(directory, item.name));
    }
  }
  return files;
}

function parsedTable(file: string): [string, string[]][] {
  const table: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return Object.entries(typeof table === 'object' && table !== null ? table : {}).map(
    ([id, labels]) => [id, Array.isArray(labels) ? labels.map(textOf) : []],
  );
}

export function labelTable(directory: string = TABLES): Map<string, string[]> {
  return new Map(tableFiles(directory).flatMap(parsedTable));
}

export function labelProblems(id: string, labels: readonly string[] | undefined): string[] {
  if (labels === undefined || labels.length === 0) {
    return [`${id}: no labels (add it to core/reference/labels/tables/)`];
  }
  const unknown = labels.filter((label) => !isLabel(label));
  return [
    ...(unknown.length > 0 ? [`${id}: unknown labels ${unknown.join(', ')}`] : []),
    ...(isKind(labels[0] ?? '')
      ? []
      : [`${id}: the first label must be a kind, not ${labels[0] ?? ''}`]),
  ];
}

function ordered(labels: readonly string[]): string[] {
  const kinds = labels.filter(isKind);
  return [...new Set(kinds), ...FRAMEWORKS.filter((label) => labels.includes(label))];
}

export function entryLabeler(): (entry: Entry) => Entry {
  const table = labelTable();
  const upstream = upstreamLabelResolver();
  return (entry) => {
    const id = textOf(entry['id']);
    const labels = table.get(id) ?? upstream(entry);
    const problems = labelProblems(id, labels);
    if (problems.length > 0) {
      throw new Error(`The rule reference has problems:\n${problems.join('\n')}`);
    }
    return { ...entry, labels: ordered(labels ?? []) };
  };
}
