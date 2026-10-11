import path from 'node:path';

export async function layeredPrettierOptions(
  prettier,
  { precedence, policyOptions, liveProjectRoot, relativePath },
) {
  const layers = await Promise.all(
    precedence.map(async (layer) =>
      layer === 'nitpicker'
        ? policyOptions
        : ((await prettier.resolveConfig(path.join(liveProjectRoot, relativePath), {
            editorconfig: true,
          })) ?? {}),
    ),
  );
  return layers.toReversed().reduce((merged, layer) => ({ ...merged, ...layer }), {});
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
