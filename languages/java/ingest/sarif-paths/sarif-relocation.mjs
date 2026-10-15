import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizeUri } from '../sarif.mjs';

export function prepareSarif(log, { roots, sourceRoots, projectRoot, identityKey }) {
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).map((result) =>
        prepareResult(result, { roots, sourceRoots, projectRoot, identityKey }),
      ),
    })),
  };
}

function prepareResult(result, { roots, sourceRoots, projectRoot, identityKey }) {
  const subject = identityKey(result);
  const prepared = {
    ...result,
    level: result.level === 'error' ? 'error' : 'warning',
    locations: (result.locations ?? []).map((location) =>
      relocate(location, { roots, sourceRoots, projectRoot }),
    ),
  };
  if (typeof subject === 'string' && subject !== '' && result.partialFingerprints === undefined) {
    prepared.partialFingerprints = { 'nitpicker/subject': subject };
  }
  return prepared;
}

function relocate(location, { roots, sourceRoots, projectRoot }) {
  const uri = location.physicalLocation?.artifactLocation?.uri;
  if (typeof uri !== 'string') {
    return location;
  }
  const resolved = resolveUri(uri, { roots, sourceRoots, projectRoot });
  return {
    ...location,
    physicalLocation: {
      ...location.physicalLocation,
      artifactLocation: { uri: resolved },
    },
  };
}

export function projectRelative(uri, roots) {
  for (const root of roots) {
    const relative = normalizeUri(uri, root);
    if (relative !== undefined) {
      return relative;
    }
  }
  return undefined;
}

function resolveUri(uri, { roots, sourceRoots, projectRoot }) {
  const relative = projectRelative(uri, roots);
  if (relative === undefined) {
    return uri;
  }
  const owner = sourceRoots.find((sourceRoot) =>
    existsSync(path.join(projectRoot, sourceRoot, relative)),
  );
  return owner === undefined ? relative : `${owner}/${relative}`;
}
