import { createRequire } from 'node:module';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { FixContext } from '../typed/project-types.mts';
import type { ToolFinding } from '../typed/reuse-views.mts';

const require = createRequire(import.meta.url);

type ReuseFindings = (
  settings: { readonly projectRoot: string; readonly analyzerName: string },
  environment: unknown,
) => readonly ToolFinding[];

function isReuseModule(value: unknown): value is { readonly reuseFindings: ReuseFindings } {
  return typeof fieldOf(value, 'reuseFindings') === 'function';
}

export function reuseFindingsFor(context: FixContext, rule: string): ToolFinding[] {
  const loaded: unknown = require('../../../preset/structure/reuse/reuse-findings.mjs');
  if (!isReuseModule(loaded)) {
    throw new TypeError('The reuse findings module does not export reuseFindings');
  }
  const { reuseFindings } = loaded;
  const environment = fieldOf(context.inputs, 'policyEnvironment') ?? {};
  return reuseFindings(
    { projectRoot: context.projectRoot, analyzerName: 'structure' },
    environment,
  ).filter((finding) => finding.rule === rule);
}
