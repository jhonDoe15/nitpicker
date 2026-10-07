import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runWorkingTreeQuality } from './run.mjs';

const projectRoot = path.resolve(import.meta.dirname, '../..');

export function parseArguments(arguments_) {
  let baseRef;
  let outputRoot;
  let fixSafe = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help') {
      return { kind: 'help' };
    }
    if (argument === '--fix-safe') {
      fixSafe = true;
      continue;
    }
    if (argument === '--base' || argument === '--output') {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === '--base') {
        if (baseRef !== undefined) {
          throw new Error('--base may only be provided once');
        }
        baseRef = value;
      } else {
        if (outputRoot !== undefined) {
          throw new Error('--output may only be provided once');
        }
        outputRoot = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (baseRef === undefined) {
    throw new Error('An explicit base ref is required. Use --base <ref>.');
  }
  return { kind: 'run', baseRef, outputRoot, fixSafe };
}

export function runCli({
  arguments_ = process.argv.slice(2),
  currentProjectRoot = projectRoot,
  stdout = process.stdout,
  stderr = process.stderr,
  execute,
} = {}) {
  try {
    const options = parseArguments(arguments_);
    if (options.kind === 'help') {
      stdout.write(
        'Usage: nitpicker working-tree --base <ref> [--fix-safe] [--output <directory>]\n',
      );
      return 0;
    }
    const outputRoot =
      options.outputRoot === undefined
        ? path.join(currentProjectRoot, 'reports/quality/working-tree')
        : path.resolve(currentProjectRoot, options.outputRoot);
    const result = runWorkingTreeQuality({
      baseRef: options.baseRef,
      fixSafe: options.fixSafe,
      projectRoot: currentProjectRoot,
      outputRoot,
      toolRoot: projectRoot,
      execute,
    });
    stdout.write(result.text);
    return result.exitCode;
  } catch (error) {
    stderr.write(
      `nitpicker working-tree failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  process.exitCode = runCli();
}
