import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';

const DEFAULT_EXPORT_SCRIPT = [
  "const { pathToFileURL } = await import('node:url');",
  'try {',
  '  const loaded = await import(pathToFileURL(process.argv[1]).href);',
  "  process.stdout.write(JSON.stringify(loaded.default ?? null) ?? 'null');",
  '} catch (error) {',
  '  process.stderr.write(String(error?.message ?? error));',
  '  process.exitCode = 1;',
  '}',
].join('\n');

function insideProject(projectRoot, name) {
  const root = realpathSync(projectRoot);
  const file = resolveInside(projectRoot, name);
  if (
    file === undefined ||
    resolveInside(root, path.relative(root, realpathSync(file))) === undefined
  ) {
    throw new Error(`${name} must stay inside the project`);
  }
  return file;
}

function parsedJson(file, name) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${name} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function defaultExport(file, name, projectRoot) {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--input-type=module', '--eval', DEFAULT_EXPORT_SCRIPT, file],
    { cwd: projectRoot, encoding: 'utf8' },
  );
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr.trim();
    throw new Error(`${name} could not be loaded: ${detail}`);
  }
  return JSON.parse(result.stdout);
}

export function readConfigObject(projectRoot, name) {
  const file = insideProject(projectRoot, name);
  const json = path.extname(name) === '.json';
  const value = json ? parsedJson(file, name) : defaultExport(file, name, projectRoot);
  if (!isPlainObject(value)) {
    throw new Error(
      `${name} must ${json ? 'contain a JSON object' : 'export an object as its default export'}`,
    );
  }
  return value;
}

export function pickedKeys(source, keys) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}
