import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';

const PIT_FAILURE_FILE = 'failure.txt';
const PIT_FAILURE_RULE = 'pit-failure';

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
    rule: PIT_FAILURE_RULE,
    path: '.',
    identity: [PIT_FAILURE_RULE, moduleDir || '.', part].filter(Boolean).join(':'),
    message: withTroubleshooting(
      readFileSync(file, 'utf8').trim(),
      TROUBLESHOOTING_ANCHORS.pitFails,
    ),
    classification: 'tool-error',
  }));
}
