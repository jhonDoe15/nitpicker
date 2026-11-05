import { describe, expect, it } from 'vitest';
import { detectConventions } from '../../../../shared/conventions/detect.mjs';
import {
  describeConventions,
  validateConventions,
} from '../../../../shared/conventions/settings.mjs';
import {
  DETACHED_WORK_RUNNERS_CONVENTION,
  detachedWorkRunnerNames,
} from './detached-work-runners.mjs';

const definition = DETACHED_WORK_RUNNERS_CONVENTION;

function detect(pinned) {
  const read = [];
  const detected = detectConventions({
    definitions: [definition],
    source: {
      paths: () => ['src/jobs.ts'],
      readMany: (paths) => {
        read.push(...paths);
        return new Map(paths.map((file) => [file, 'export function runDetached() {}\n']));
      },
    },
    pinned,
  })[definition.id];
  return { detected, read };
}

describe('detached-work runners', () => {
  it('names no runner unless the config pins one', () => {
    expect(detachedWorkRunnerNames()).toEqual([]);
    expect(detachedWorkRunnerNames({ 'typescript.detachedWorkRunners': ['runDetached'] })).toEqual([
      'runDetached',
    ]);
  });

  it('is never measured from the project files', () => {
    expect(detect()).toEqual({
      detected: { choice: [], source: 'default', counts: {}, files: 0 },
      read: [],
    });
  });

  it('takes and describes a pinned list', () => {
    const { detected } = detect({ 'typescript.detachedWorkRunners': ['runDetached'] });

    expect(describeConventions({ [definition.id]: detected }, [definition])).toEqual([
      'Detached-work runners: runDetached (set in nitpicker.config.json)',
    ]);
  });

  it('rejects a pin that is not a list of function names', () => {
    expect(() => {
      validateConventions({ 'typescript.detachedWorkRunners': ['jobs.run'] }, [definition]);
    }).toThrow('"conventions.typescript.detachedWorkRunners" must be a list of function names');
  });
});
