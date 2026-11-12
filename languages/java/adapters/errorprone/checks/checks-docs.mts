import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CHECKS_FILE, type ErrorProneChecks, checksOf } from './checks-shape.mts';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../../../..');

export function errorProneChecks(): ErrorProneChecks {
  return checksOf(JSON.parse(readFileSync(path.join(PACKAGE_ROOT, CHECKS_FILE), 'utf8')));
}

const ERROR_PRONE_PAGE = 'docs/java-preset/error-prone-and-nullaway.md';

export function documentedChecks(heading: string): string[] {
  const doc = readFileSync(path.join(PACKAGE_ROOT, ERROR_PRONE_PAGE), 'utf8');
  const start = doc.indexOf(`## ${heading}\n`);
  if (start === -1) {
    throw new Error(`${ERROR_PRONE_PAGE} has no section ${heading}`);
  }
  const section = doc.slice(start);
  const table = section.slice(0, section.indexOf('\n\n', section.indexOf('| ---')));
  return [...table.matchAll(/^\| `(\w+)` +\| .+\|$/gmu)].flatMap(([, name]) => name ?? []);
}
