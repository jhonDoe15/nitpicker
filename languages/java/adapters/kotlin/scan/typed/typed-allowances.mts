import { listOf } from '../../../../../../shared/values/readers.mts';
import { withFrameworkAllowances as untypedWithFrameworkAllowances } from '../framework-allowances.mjs';

export type Allowed = {
  tool: string;
  rule: string;
  path: string;
  message: string;
  location: { line: number };
};

type AllowanceOptions = {
  projectRoot: string;
  spring?: true;
  testRoots?: string[];
};

function isAllowed(value: unknown): value is Allowed {
  return typeof value === 'object' && value !== null && 'location' in value && 'path' in value;
}

export function withFrameworkAllowances(findings: Allowed[], options: AllowanceOptions): Allowed[] {
  const kept: unknown = Reflect.apply(untypedWithFrameworkAllowances, undefined, [
    findings,
    options,
  ]);
  return listOf(kept).filter(isAllowed);
}
