import { realpathSync } from 'node:fs';
import path from 'node:path';
import { configError } from '../../../../shared/config.mjs';
import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import type { SelectedProjectLayout } from './typed/module-types.mts';
import { parsedTsconfig, readJsonc } from './tsconfig-files.mts';

export function selectedProjectTsconfig(
  projectDirectory: string,
  layout: SelectedProjectLayout,
): string {
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
  function fromConfig(file: string): string {
    return path.relative(projectDirectory, path.resolve(base, file)).split(path.sep).join('/');
  }
  const rawExclude = fieldOf(parsed.raw, 'exclude');
  const excluded =
    rawExclude === undefined
      ? [
          'node_modules',
          'bower_components',
          'jspm_packages',
          ...(parsed.options.outDir === undefined ? [] : [parsed.options.outDir]),
        ]
      : textsOf(rawExclude);
  return `${JSON.stringify(
    {
      extends: `./${name}`,
      compilerOptions: { noCheck: false, noEmit: true },
      exclude: [...excluded.map(fromConfig), ...layout.exclude],
      ...(fieldOf(config, 'references') === undefined
        ? {}
        : {
            references: listOf(fieldOf(config, 'references')).map((reference) => ({
              ...fieldsOf(reference),
              path: fromConfig(textOf(fieldOf(reference, 'path'))),
            })),
          }),
    },
    null,
    2,
  )}\n`;
}
