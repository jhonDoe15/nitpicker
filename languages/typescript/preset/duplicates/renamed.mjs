import ts from 'typescript';
import { realpathSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceFilesUnder } from '../../../../shared/renamed-clones/files.mjs';
import { RENAMED_SETTINGS, withNormalizedTree } from '../../../../shared/renamed-clones/tree.mjs';
import { codeExtensionNames, existingRoots } from '../layout.mjs';

const EXTENSIONS = codeExtensionNames.map((name) => `.${name}`);

export function renamedDuplicatesReport({ projectRoot, config, runJscpd }) {
  const files = sourceFilesUnder(projectRoot, config.path, EXTENSIONS);
  return withNormalizedTree(
    { projectRoot, files, syntaxOf: () => 'typescript', typescript: ts },
    ({ tree, scratch }) => {
      const roots = existingRoots(tree, config.path);
      if (roots.length === 0) {
        return undefined;
      }
      const output = path.join(scratch, 'report');
      const configPath = path.join(tree, '.nitpicker-renamed-jscpd.json');
      const settings = {
        ...config,
        ...RENAMED_SETTINGS,
        path: roots,
        absolute: true,
        reporters: ['json'],
        output,
      };
      writeFileSync(configPath, `${JSON.stringify(settings)}\n`);
      runJscpd({ configPath, cwd: tree });
      return {
        report: JSON.parse(readFileSync(path.join(output, 'jscpd-report.json'), 'utf8')),
        root: realpathSync(tree),
      };
    },
  );
}
