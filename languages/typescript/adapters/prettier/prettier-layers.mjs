import path from 'node:path';
import {
  followedPrettierOptions,
  prettierConventionOptions,
} from '../../conventions/prettier-conventions.mjs';
import {
  dataConventionOptions,
  dataFileKind,
} from '../../conventions/measures/data-conventions.mjs';
import { readHeadPolicy } from '../../preset/head-policy.mjs';

const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

export async function layeredPrettierOptions(prettier, settings) {
  const layers = await Promise.all(
    withDetectedBase(settings.precedence).map((layer) => layerOptions(prettier, settings, layer)),
  );
  return layers.toReversed().reduce((merged, layer) => ({ ...merged, ...layer }), {});
}

function withDetectedBase(precedence) {
  return precedence.includes('nitpicker') ? precedence : [...precedence, 'detected'];
}

async function layerOptions(prettier, settings, layer) {
  const { policyOptions, liveProjectRoot, relativePath } = settings;
  if (layer === 'nitpicker') {
    return { ...policyOptions, ...conventionOptions(relativePath, { followed: false }) };
  }
  if (layer === 'detected') {
    return conventionOptions(relativePath, { followed: true });
  }
  return (
    (await prettier.resolveConfig(path.join(liveProjectRoot, relativePath), {
      editorconfig: true,
    })) ?? {}
  );
}

function conventionOptions(relativePath, { followed }) {
  const { conventions } = readHeadPolicy();
  if (CODE_FILE.test(relativePath)) {
    return followed ? followedPrettierOptions(conventions) : prettierConventionOptions(conventions);
  }
  const kind = dataFileKind(relativePath);
  return kind === undefined ? {} : dataConventionOptions(kind, conventions, { followed });
}

export async function isIgnoredByLayers(
  prettier,
  { precedence, policyIgnorePath, projectRoot, liveProjectRoot, relativePath },
) {
  const policyInfo = await prettier.getFileInfo(path.join(projectRoot, relativePath), {
    ignorePath: policyIgnorePath,
  });
  if (policyInfo.ignored || policyInfo.inferredParser === null) {
    return true;
  }
  if (!precedence.includes('project')) {
    return false;
  }
  const projectInfo = await prettier.getFileInfo(path.join(liveProjectRoot, relativePath), {
    ignorePath: path.join(liveProjectRoot, '.prettierignore'),
  });
  return projectInfo.ignored;
}
