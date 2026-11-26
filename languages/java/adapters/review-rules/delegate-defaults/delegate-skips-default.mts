import { findingFactory } from '../../kotlin/review-rules/finding/review-finding.mts';
import { mainSourceTypes } from '../type-declarations/declarations.mts';
import { indexOf } from '../type-declarations/type-index.mts';
import { wrappersIn } from './wrappers.mts';
import type { ParsedTypes } from '../type-declarations/declarations.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';

export const DELEGATE_SKIPS_DEFAULT_RULE = 'DelegateSkipsDefaultMethod';
export const DELEGATE_SKIPS_DEFAULT_EXCEPTION_RULE = `pmd/${DELEGATE_SKIPS_DEFAULT_RULE}`;

function skipMessage(contract: string, delegate: string, missing: string): string {
  return (
    `This wrapper forwards \`${contract}\` methods to \`${delegate}\` but not the default ` +
    `${missing}, so those calls run the default and never reach the delegate; forward ` +
    `them, or override one calling \`${contract}.super.<method>()\` to keep the default.`
  );
}

function namesOf(missing: readonly string[]): string {
  const names = missing.map((key) => `\`${key.split('/')[0] ?? key}()\``).join(', ');
  return `method${missing.length === 1 ? '' : 's'} ${names}`;
}

export function delegateSkipsDefaultIn(parsed: readonly ParsedTypes[]): ReviewFinding[] {
  const finding = findingFactory();
  const types = parsed.flatMap((each) => each.types);
  return wrappersIn(types, indexOf(types)).map(({ type, delegate, contract, missing }) =>
    finding({
      rule: DELEGATE_SKIPS_DEFAULT_RULE,
      file: type.file,
      line: type.line,
      symbol: type.name,
      key: `${type.file}:${type.name}`,
      message: skipMessage(contract.name, delegate.name, namesOf(missing)),
    }),
  );
}

export function readDelegateSkipsDefaultFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  return delegateSkipsDefaultIn(mainSourceTypes(projectRoot, options));
}

export const DELEGATE_SKIPS_DEFAULT_ALLOWED = skipMessage('<Interface>', '<delegate>', 'methods');
