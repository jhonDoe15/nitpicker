import { ts } from '../../typescript-api/typescript-api.mjs';
import { realpathSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceFilesUnder } from '../../../../shared/renamed-clones/files.mjs';
import { RENAMED_SETTINGS, withNormalizedTree } from '../../../../shared/renamed-clones/tree.mjs';
import {
  trackTemporaryPath,
  untrackTemporaryPath,
} from '../../../../core/tooling/temporary-files.mjs';
import { codeExtensionNames, existingRoots } from '../layout.mjs';

const EXTENSIONS = codeExtensionNames.map((name) => `.${name}`);

export function renamedDuplicatesReport({ projectRoot, config, runJscpd, scratchRoot }) {
  const files = sourceFilesUnder(projectRoot, config.path, EXTENSIONS);
  return withNormalizedTree(
    {
      projectRoot,
      files,
      syntaxOf: () => 'typescript',
      typescript: ts,
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
        ...config,
        ...RENAMED_SETTINGS,
        path: ['.'],
        absolute: false,
        reporters: ['json'],
        output,
      };
      writeFileSync(path.join(tree, configName), `${JSON.stringify(settings)}\n`);
      runJscpd({ configPath: configName, cwd: tree });
      return {
        report: JSON.parse(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8')),
        root: realpathSync(tree),
      };
    },
  );
}
