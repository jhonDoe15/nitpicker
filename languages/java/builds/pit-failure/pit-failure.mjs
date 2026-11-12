import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MUTATION_FAILED_PART_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';

const PIT_FAILURE_FILE = 'failure.txt';

export function writePitFailure(pitDir, error) {
  writeFileSync(
    path.join(pitDir, PIT_FAILURE_FILE),
    error instanceof Error ? error.message : String(error),
  );
}

function failureFiles(pitRoot) {
  const parts = existsSync(pitRoot)
    ? readdirSync(pitRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .toSorted()
    : [];
  return ['', ...parts]
    .map((part) => ({ part, file: path.join(pitRoot, part, PIT_FAILURE_FILE) }))
    .filter(({ file }) => existsSync(file));
}

export function pitFailureFindings(reportRoot, moduleDir = '') {
  return failureFiles(path.join(reportRoot, 'pit')).map(({ part, file }) => ({
    tool: 'pit',
    rule: MUTATION_FAILED_PART_RULE,
    path: '.',
    identity: [MUTATION_FAILED_PART_RULE, moduleDir || '.', part].filter(Boolean).join(':'),
    symbol: moduleDir || '.',
    message: withTroubleshooting(
      readFileSync(file, 'utf8').trim(),
      TROUBLESHOOTING_ANCHORS.pitFails,
    ),
    classification: 'tool-error',
  }));
}
