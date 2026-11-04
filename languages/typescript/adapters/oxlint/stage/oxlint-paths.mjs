import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { isRecord } from '../../../../../shared/rules/facts/checks.mjs';

const NO_INPUT_ERROR_CODES = new Set([18002, 18003]);

export function baseUrlFreeOptions(config, configPath) {
  const { options, errors } = ts.parseJsonConfigFileContent(
    { ...config, include: [], files: [] },
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  const failures = errors.filter(({ code }) => !NO_INPUT_ERROR_CODES.has(code));
  if (failures.length > 0) {
    const messages = failures.map(({ messageText }) =>
      ts.flattenDiagnosticMessageText(messageText, ' '),
    );
    throw new Error(`Lint TypeScript config ${configPath} is invalid: ${messages.join('; ')}`);
  }
  if (options.baseUrl === undefined) return {};
  return { baseUrl: null, ...absolutePaths(options.baseUrl, options.paths) };
}

function absolutePaths(baseUrl, paths) {
  if (paths !== undefined && !isRecord(paths)) return {};
  const mapped = Object.fromEntries(
    Object.entries(paths ?? {}).map(([pattern, targets]) => [
      pattern,
      Array.isArray(targets) ? targets.map((target) => absoluteTarget(baseUrl, target)) : targets,
    ]),
  );
  return { paths: { ...mapped, '*': withBareLookup(mapped['*'], absoluteTarget(baseUrl, '*')) } };
}

function withBareLookup(targets, bareTarget) {
  if (targets === undefined) return [bareTarget];
  return Array.isArray(targets) ? [...targets, bareTarget] : targets;
}

function absoluteTarget(baseUrl, target) {
  return typeof target === 'string' ? path.resolve(baseUrl, target).replaceAll('\\', '/') : target;
}
