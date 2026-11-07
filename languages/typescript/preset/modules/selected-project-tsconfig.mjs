import { realpathSync } from 'node:fs';
import path from 'node:path';
import { configError } from '../../../../shared/config.mjs';
import { parsedTsconfig, readJsonc } from './tsconfig-files.mjs';

export function selectedProjectTsconfig(projectDirectory, layout) {
  const name = layout.typescriptProject.replaceAll('\\', '/');
  const configPath = path.resolve(projectDirectory, name);
  if (!configPath.startsWith(path.resolve(projectDirectory) + path.sep)) {
    throw configError('"tools.typescript.project" must name a JSON config file inside the project');
  }
  const relative = path.relative(realpathSync(projectDirectory), realpathSync(configPath));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw configError('"tools.typescript.project" must name a JSON config file inside the project');
  }
  const parsed = parsedTsconfig(configPath);
  const config = readJsonc(configPath);
  const base = path.dirname(configPath);
  function fromConfig(file) {
    return path.relative(projectDirectory, path.resolve(base, file)).split(path.sep).join('/');
  }
  const excluded = parsed.raw.exclude ?? [
    'node_modules',
    'bower_components',
    'jspm_packages',
    ...(parsed.options.outDir === undefined ? [] : [parsed.options.outDir]),
  ];
  return `${JSON.stringify(
    {
      extends: `./${name}`,
      compilerOptions: { noCheck: false, noEmit: true },
      exclude: [...excluded.map(fromConfig), ...layout.exclude],
      ...(config?.references === undefined
        ? {}
        : {
            references: config.references.map((reference) => ({
              ...reference,
              path: fromConfig(reference.path),
            })),
          }),
    },
    null,
    2,
  )}\n`;
}
