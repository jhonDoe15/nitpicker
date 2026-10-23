import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../../shared/config.mjs';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
  withTroubleshooting,
} from '../../../../shared/messages/troubleshooting.mjs';

const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const ENGINE_HINT =
  'Set "tools": { "eslint": { "engine": "eslint" } } in nitpicker.config.json to lint with ESLint instead.';

export function oxlintBinary() {
  return resolveTool('oxlint', { bin: 'bin/oxlint' }).binPath;
}

export function tsgolintBinary() {
  const packageRoot = path.dirname(resolveTool('oxlint-tsgolint', { bin: 'package.json' }).binPath);
  const executable = process.platform === 'win32' ? 'tsgolint.exe' : 'tsgolint';
  const platformPackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
  try {
    return createRequire(path.join(packageRoot, 'package.json')).resolve(
      `${platformPackage}/${executable}`,
    );
  } catch (error) {
    throw troubleshootingError(
      `The type-aware lint rules need ${platformPackage}, which is not installed. ${ENGINE_HINT}`,
      TROUBLESHOOTING_ANCHORS.engineUnavailable,
      { cause: error },
    );
  }
}

export function withEngineHint(detail) {
  return detail.includes(CONFIG_FILE_NAME)
    ? detail
    : withTroubleshooting(`${detail}\n${ENGINE_HINT}`, TROUBLESHOOTING_ANCHORS.engineUnavailable);
}

export function withCompileCache(environment) {
  return {
    NODE_COMPILE_CACHE: path.join(tmpdir(), 'nitpicker-node-compile-cache'),
    ...environment,
  };
}

export function spawnJson(argumentList, { cwd, env, context, timeoutMs, acceptedStatuses = [0] }) {
  const result = spawnSync(process.execPath, argumentList, {
    cwd,
    env: withCompileCache(env),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
  });
  if (result.error !== undefined) {
    throw new Error(`${context} failed: ${result.error.message}`, { cause: result.error });
  }
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${context} exited with ${String(result.status)}: ${withEngineHint(detail)}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const detail = (result.stderr.trim() || result.stdout).slice(0, 2000);
    throw new Error(`${context} did not produce valid JSON: ${detail}`, { cause: error });
  }
}
