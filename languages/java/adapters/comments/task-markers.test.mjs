import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TASK_MARKER_PATTERN, unreferencedMarker } from './task-markers.mjs';

const DETEKT_CONFIG = path.resolve(import.meta.dirname, '../../detekt/nitpicker-detekt.yml');

describe('unreferencedMarker', () => {
  it.each([
    'TODO fix this',
    'TODO: fix this',
    'TODO(someone): fix this',
    'FIXME',
    ' * FIXME: later',
    'XXX: RFC-3339 only',
    'HACK: skips the table',
    'STOPSHIP before release',
    'revisit this TODO: soon',
    'TODO(SHA-1): not an issue key',
  ])('flags %j', (line) => {
    expect(unreferencedMarker(line)).toBe(true);
  });

  it.each([
    'TODO(#123): fix this',
    'TODO #123 fix this',
    'TODO: PROJ-123 fix this',
    'TODO(PROJ-123)',
    'TODO https://example.com/issues/1',
    'FIXME(#7): later',
    'todo lists are fine',
    'The TODO list is long',
    'a/TODO/b',
    'TODO-list',
    'XXX.yaml',
    'Hack to work around the cache',
  ])('allows %j', (line) => {
    expect(unreferencedMarker(line)).toBe(false);
  });

  it("is the pattern of the Kotlin preset's ForbiddenComment", () => {
    const config = readFileSync(DETEKT_CONFIG, 'utf8');

    const lines = config.split('\n').map((line) => line.trim());

    expect(lines.filter((line) => line.includes(TASK_MARKER_PATTERN))).toEqual([
      `- value: '(?m)(?-i)${TASK_MARKER_PATTERN}'`,
    ]);
  });
});
