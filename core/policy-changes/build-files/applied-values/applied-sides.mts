import {
  appliedJscpdConfig,
  appliedRunnerRetry,
  appliedStrykerConfig,
  appliedTypescriptOptions,
  JSCPD_PROJECT_FILE,
  readRealInside,
  TESTS_TOOL,
} from '../../types/tool-views.mts';
import { resolveLayoutFor } from '../../types/typed-views.mts';
import type { AppliedSide, AppliedValues, ProjectSide } from '../../types/policy-types.mts';

function jscpdSide(side: ProjectSide, optedIn: boolean): AppliedSide {
  const content = optedIn ? readRealInside(side.root, JSCPD_PROJECT_FILE) : undefined;
  return content === undefined
    ? { kind: 'applied', config: {} }
    : appliedJscpdConfig(content.toString('utf8'));
}

function strykerSide(side: ProjectSide, optedIn: boolean): AppliedSide {
  try {
    const { values, file } = optedIn ? appliedStrykerConfig(side.root) : { values: {} };
    return { kind: 'applied', config: values, files: file === undefined ? [] : [file] };
  } catch {
    return { kind: 'rejected' };
  }
}

function typescriptSide(side: ProjectSide, optedIn: boolean): AppliedSide {
  try {
    return optedIn
      ? { kind: 'applied', ...appliedTypescriptOptions(side.root, resolveLayoutFor(side.config)) }
      : { kind: 'rejected' };
  } catch {
    return { kind: 'rejected' };
  }
}

function testsSide(side: ProjectSide, optedIn: boolean): AppliedSide {
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

const APPLIED_SIDES = new Map<string, (side: ProjectSide, optedIn: boolean) => AppliedSide>([
  ['jscpd', jscpdSide],
  ['stryker', strykerSide],
  ['typescript', typescriptSide],
  [TESTS_TOOL, testsSide],
]);

export function appliedConfigs(
  tool: string,
  { base, head, baseOptedIn }: { base: ProjectSide; head: ProjectSide; baseOptedIn: boolean },
): { applied?: AppliedValues } {
  const read = APPLIED_SIDES.get(tool);
  if (read === undefined) {
    return {};
  }
  const sides = [read(base, baseOptedIn), read(head, true)];
  const [before, after] = sides;
  if (before?.kind !== 'applied' || after?.kind !== 'applied') {
    return {};
  }
  return {
    applied: {
      base: before.config,
      head: after.config,
      file: after.file,
      files: [
        ...new Set(sides.flatMap((side) => (side.kind === 'applied' ? (side.files ?? []) : []))),
      ],
    },
  };
}
