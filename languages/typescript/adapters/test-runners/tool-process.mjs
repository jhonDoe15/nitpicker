import { spawnSync } from 'node:child_process';
import { resolveTool, toolNameForPath } from '../../../../core/tooling/tool-resolution.mjs';

const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;

export function spawnNodeTool({
  options,
  relativeToolPath,
  absoluteToolPath,
  arguments_,
  cwd = options.projectRoot,
  environment = {},
  nodeArguments = [],
}) {
  const name = relativeToolPath === undefined ? undefined : toolNameForPath(relativeToolPath);
  const toolPath =
    absoluteToolPath ??
    resolveTool(name, {
      projectRoot: options.liveProjectRoot,
      bin: relativeToolPath.slice(name.length + 1),
    }).binPath;
  const result = spawnSync(process.execPath, [...nodeArguments, toolPath, ...arguments_], {
    cwd,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return result;
}

export function runNodeTool({ acceptedStatuses, ...invocation }) {
  const result = spawnNodeTool(invocation);
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${invocation.options.kind} exited with ${String(result.status)}: ${detail}`);
  }
  return result;
}

export function formatProcessOutput(result) {
  const output = [result.stderr, result.stdout]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join('\n');
  return output.length > 0 ? `\nProcess output:\n${output}` : '';
}
