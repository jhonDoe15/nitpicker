import { globMatcher as untypedGlobMatcher } from '../../../../../shared/paths/glob.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import {
  INLINE_CONFIG_DISABLED,
  UNUSED_DIRECTIVE_RULES,
} from '../messages/non-rule-diagnostics.mts';
import { UNPARSED_FILE } from '../messages/unparsed-file.mts';
import { RULE_CRASHED } from '../../lint-engine/crashes/rule-crashes.mts';
import {
  carriedPolicyNames,
  carriedPolicyOf,
} from '../../../preset/eslint-config/production/carried-policies.mts';

type Environment = Readonly<Record<string, string | undefined>>;
export type ProductionScope = {
  readonly sourceGlobs: readonly string[];
  readonly ignores: readonly string[];
};

const globMatcher: (glob: string) => { test(file: string): boolean } = untypedGlobMatcher;
const PASS_NOTES = new Set([INLINE_CONFIG_DISABLED, UNPARSED_FILE, RULE_CRASHED]);

function isPassNote(finding: Finding): boolean {
  return UNUSED_DIRECTIVE_RULES.has(finding.rule) || PASS_NOTES.has(finding.rule);
}

function productionScope({ sourceGlobs, ignores }: ProductionScope): (file: string) => boolean {
  const include = sourceGlobs.map((glob) => globMatcher(glob));
  const exclude = ignores.map((glob) => globMatcher(glob));
  return (file) =>
    include.some((matcher) => matcher.test(file)) && !exclude.some((matcher) => matcher.test(file));
}

export function withCarriedTools<F extends Finding>(
  findings: readonly F[],
  environment: Environment,
): F[] {
  const names = carriedPolicyNames(environment);
  return names.length === 0
    ? [...findings]
    : findings.map((finding) => {
        const tool = carriedPolicyOf(finding.rule, names);
        return tool === undefined ? finding : { ...finding, tool };
      });
}

export function carriedPassNotes<F extends Finding>(
  findings: readonly F[],
  environment: Environment,
  scope: () => ProductionScope,
): F[] {
  const names = carriedPolicyNames(environment);
  if (names.length === 0) {
    return [];
  }
  const inScope = productionScope(scope());
  const notes = findings.filter((finding) => isPassNote(finding) && inScope(finding.path));
  return names.flatMap((tool) => notes.map((note) => ({ ...note, tool })));
}
