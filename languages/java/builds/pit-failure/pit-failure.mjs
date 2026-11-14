import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MUTATION_FAILED_PART_RULE } from '../../../../shared/rules/finding-helpers.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';
import { leadWithUnmutatedSummary, pitPartFiles } from './pit-skipped.mjs';

const PIT_FAILURE_FILE = 'failure.txt';

export function writePitFailure(pitDir, error) {
  writeFileSync(
    path.join(pitDir, PIT_FAILURE_FILE),
    error instanceof Error ? error.message : String(error),
  );
}

export function pitFailureFindings(reportRoot, moduleDir = '') {
  const pitRoot = path.join(reportRoot, 'pit');
  return pitPartFiles(pitRoot, PIT_FAILURE_FILE).map(({ part, file }) => ({
    tool: 'pit',
    rule: MUTATION_FAILED_PART_RULE,
    path: '.',
    identity: [MUTATION_FAILED_PART_RULE, moduleDir || '.', part].filter(Boolean).join(':'),
    symbol: moduleDir || '.',
    message: withTroubleshooting(
      leadWithUnmutatedSummary(pitRoot, part, readFileSync(file, 'utf8').trim()),
      TROUBLESHOOTING_ANCHORS.pitFails,
    ),
    classification: 'tool-error',
  }));
}

export function gradlePitDeadlineMs(
  { commandTimeoutMs, pitDeadlineMs },
  reserveMs,
  now = Date.now(),
) {
  return Math.min(now + commandTimeoutMs - reserveMs, pitDeadlineMs ?? Number.POSITIVE_INFINITY);
}
