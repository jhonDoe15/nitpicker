import { readRealInside } from '../../../../shared/conventions/read-inside.mjs';
import { JSCPD_PROJECT_FILE } from '../../../../shared/conventions/tool-precedence.mjs';
import { appliedJscpdConfig } from '../../../tooling/jscpd/config.mjs';
import { appliedStrykerConfig } from '../../../../languages/typescript/preset/project-configs/stryker-project-config.mjs';
import { appliedTypescriptOptions } from '../../../../languages/typescript/preset/project-configs/typescript/typescript-project-options.mjs';
import {
  TESTS_TOOL,
  appliedRunnerRetry,
} from '../../../../languages/typescript/preset/project-configs/test-runner/test-runner-config.mjs';
import { resolveLayoutFor } from '../../../../languages/typescript/preset/layout.mjs';

function jscpdSide(side, optedIn) {
  const content = optedIn ? readRealInside(side.root, JSCPD_PROJECT_FILE) : undefined;
  return content === undefined
    ? { kind: 'applied', config: {} }
    : appliedJscpdConfig(content.toString('utf8'));
}

function strykerSide(side, optedIn) {
  try {
    const { values, file } = optedIn ? appliedStrykerConfig(side.root) : { values: {} };
    return { kind: 'applied', config: values, files: file === undefined ? [] : [file] };
  } catch {
    return { kind: 'rejected' };
  }
}

function typescriptSide(side, optedIn) {
  try {
    return optedIn
      ? { kind: 'applied', ...appliedTypescriptOptions(side.root, resolveLayoutFor(side.config)) }
      : { kind: 'rejected' };
  } catch {
    return { kind: 'rejected' };
  }
}

function testsSide(side, optedIn) {
  if (!optedIn) {
    return { kind: 'rejected' };
  }
  try {
    const { values, file, files } = appliedRunnerRetry(side);
    return { kind: 'applied', config: values, file, files };
  } catch {
    return { kind: 'rejected' };
  }
}

const APPLIED_SIDES = new Map([
  ['jscpd', jscpdSide],
  ['stryker', strykerSide],
  ['typescript', typescriptSide],
  [TESTS_TOOL, testsSide],
]);

export function appliedConfigs(tool, { base, head, baseOptedIn }) {
  const read = APPLIED_SIDES.get(tool);
  if (read === undefined) {
    return {};
  }
  const sides = [read(base, baseOptedIn), read(head, true)];
  if (!sides.every(({ kind }) => kind === 'applied')) {
    return {};
  }
  return {
    applied: {
      base: sides[0].config,
      head: sides[1].config,
      file: sides[1].file,
      files: [...new Set(sides.flatMap(({ files = [] }) => files))],
    },
  };
}
