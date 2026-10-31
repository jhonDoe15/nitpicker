import { toolNameForPath, resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { spawnSyncWithOutputFile } from '../../../../core/tooling/output-file.mjs';
import { realpathSync, lstatSync, statSync } from 'node:fs';
import path from 'node:path';
import { normalizedRelativePath } from './arguments.mjs';
import { createHash } from 'node:crypto';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

export function runNodeTool({ options, relativeToolPath, arguments_, acceptedStatuses }) {
  const name = toolNameForPath(relativeToolPath);
  const toolPath = resolveTool(name, {
    projectRoot: options.liveProjectRoot,
    bin: relativeToolPath.slice(name.length + 1),
  }).binPath;
  const result = spawnSyncWithOutputFile(process.execPath, [toolPath, ...arguments_], {
    cwd: options.projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${options.kind} exited with ${String(result.status)}: ${detail}`);
  }
  return result;
}

export function projectFile(projectRoot, filePath) {
  const resolvedPath = realpathSync(path.resolve(projectRoot, filePath));
  const relativePath = path.relative(projectRoot, resolvedPath);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Analyzer path must stay within ${projectRoot}: ${filePath} resolved to ${resolvedPath}`,
    );
  }
  const entry = lstatSync(resolvedPath);
  if (!entry.isFile()) {
    throw new Error(`Analyzer returned a non-file path: ${filePath}`);
  }
  return relativePath.replaceAll('\\', '/');
}

export function policyFile(options, relativePath) {
  const normalizedPath = normalizedRelativePath(relativePath, relativePath);
  const filePath = path.resolve(options.policyRoot, normalizedPath);
  const relativeToPolicy = path.relative(options.policyRoot, filePath);
  if (relativeToPolicy.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToPolicy)) {
    throw new Error(`Policy path must stay within the policy root: ${relativePath}`);
  }
  if (!statSync(filePath).isFile()) {
    throw new Error(`Policy path is not a regular file: ${relativePath}`);
  }
  return filePath;
}

export function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}
