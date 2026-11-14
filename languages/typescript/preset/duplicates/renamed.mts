import { realpathSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJson } from '../../../../shared/values/readers.mts';
import { trackTemporaryPath, untrackTemporaryPath } from '../../adapters/typed/tooling.mts';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import {
  RENAMED_SETTINGS,
  codeExtensionNames,
  existingRoots,
  renamedJscpdSettings,
  sourceFilesUnder,
  withNormalizedTree,
} from './typed.mts';

const EXTENSIONS = codeExtensionNames.map((name) => `.${name}`);

export function renamedDuplicatesReport({
  projectRoot,
  config,
  runJscpd,
  scratchRoot,
}: {
  readonly projectRoot: string;
  readonly config: { readonly path: string[]; readonly [key: string]: unknown };
  readonly runJscpd: (run: { readonly configPath: string; readonly cwd: string }) => unknown;
  readonly scratchRoot: string;
}): { readonly report: unknown; readonly root: string } | undefined {
  const files = sourceFilesUnder(projectRoot, config.path, EXTENSIONS);
  return withNormalizedTree(
    {
      projectRoot,
      files,
      syntaxOf: () => 'typescript',
      typescript: typescriptApi(),
      scratchRoot,
      temporaryPaths: { track: trackTemporaryPath, untrack: untrackTemporaryPath },
    },
    ({ tree, scratch }) => {
      const roots = existingRoots(tree, config.path);
      if (roots.length === 0) {
        return undefined;
      }
      const output = path.join(scratch, 'report');
      const configName = '.nitpicker-renamed-jscpd.json';
      const settings = {
        ...renamedJscpdSettings(config, RENAMED_SETTINGS),
        path: ['.'],
        absolute: false,
        reporters: ['json'],
        output,
      };
      writeFileSync(path.join(tree, configName), `${JSON.stringify(settings)}\n`);
      runJscpd({ configPath: configName, cwd: tree });
      return {
        report: parseJson(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8')),
        root: realpathSync(tree),
      };
    },
  );
}
