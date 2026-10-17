import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { hasGeneratorMarker } from '../../../../shared/conventions/generator-marker.mjs';
import { codeExtensionNames, mayBeGenerated } from '../layout.mjs';

const MAX_LISTING_BYTES = 64 * 1024 * 1024;
const CODE_FILE = new RegExp(`\\.(?:${codeExtensionNames.join('|')})$`, 'u');

function projectFiles(projectRoot) {
  const listed = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: MAX_LISTING_BYTES,
    },
  );
  return listed.status === 0 ? listed.stdout.split('\0').filter(Boolean) : [];
}

export function markedGeneratedFiles(projectRoot) {
  return projectFiles(projectRoot).filter((file) => {
    const absolute = pathInside(projectRoot, file);
    return (
      CODE_FILE.test(file) &&
      mayBeGenerated(file) &&
      absolute !== undefined &&
      existsSync(absolute) &&
      hasGeneratorMarker(readFileSync(absolute, 'utf8'))
    );
  });
}
