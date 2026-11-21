import { existsSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, fieldsOf, listOf } from '../../values/readers.mts';
import type { PrepareOptions, RelocateOptions } from '../typed/sarif-types.mts';
import { normalizeUri } from './uri.mts';

export function prepareSarif(
  log: unknown,
  { roots, sourceRoots, projectRoot, identityKey }: PrepareOptions,
): Record<string, unknown> {
  return {
    ...fieldsOf(log),
    runs: listOf(fieldOf(log, 'runs')).map((run) => ({
      ...fieldsOf(run),
      results: listOf(fieldOf(run, 'results')).map((result) =>
        prepareResult(result, { roots, sourceRoots, projectRoot, identityKey }),
      ),
    })),
  };
}

function prepareResult(
  result: unknown,
  { roots, sourceRoots, projectRoot, identityKey }: PrepareOptions,
): Record<string, unknown> {
  const fields = fieldsOf(result);
  const subject = identityKey(fields);
  const prepared: Record<string, unknown> = {
    ...fields,
    level: fields['level'] === 'error' ? 'error' : 'warning',
    locations: listOf(fields['locations']).map((location) =>
      relocate(location, { roots, sourceRoots, projectRoot }),
    ),
  };
  if (
    typeof subject === 'string' &&
    subject !== '' &&
    fields['partialFingerprints'] === undefined
  ) {
    prepared['partialFingerprints'] = { 'nitpicker/subject': subject };
  }
  return prepared;
}

function relocate(
  location: unknown,
  { roots, sourceRoots, projectRoot }: RelocateOptions,
): unknown {
  const physical = fieldOf(location, 'physicalLocation');
  const uri = fieldOf(fieldOf(physical, 'artifactLocation'), 'uri');
  if (typeof uri !== 'string') {
    return location;
  }
  const resolved = resolveUri(uri, { roots, sourceRoots, projectRoot });
  return {
    ...fieldsOf(location),
    physicalLocation: {
      ...fieldsOf(physical),
      artifactLocation: { uri: resolved },
    },
  };
}

export function projectRelative(uri: string, roots: readonly string[]): string | undefined {
  for (const root of roots) {
    const relative = normalizeUri(uri, root);
    if (relative !== undefined) {
      return relative;
    }
  }
  return undefined;
}

function resolveUri(uri: string, { roots, sourceRoots, projectRoot }: RelocateOptions): string {
  const relative = projectRelative(uri, roots);
  if (relative === undefined) {
    return uri;
  }
  const base = path.resolve(projectRoot);
  const owner = sourceRoots.find((sourceRoot) => {
    const full = path.resolve(base, sourceRoot, relative);
    if (!full.startsWith(base + path.sep)) {
      return false;
    }
    return existsSync(full);
  });
  return owner === undefined ? relative : `${owner}/${relative}`;
}
