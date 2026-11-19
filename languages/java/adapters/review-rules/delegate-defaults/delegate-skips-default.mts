import { findingFactory } from '../../kotlin/review-rules/finding/review-finding.mts';
import { importsOf, mainSourceTexts, packageOf, blankLiterals } from '../java-sources.mts';
import { parseSource } from '../max-value-sums/source/source-file.mts';
import { declarationsOf } from './declarations.mts';
import { indexOf, wrappersIn } from './wrappers.mts';
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

const WILDCARD_IMPORT = /^\s*import\s+([\w.]+)\.\*\s*;/gmu;

function wildcardImports(text: string): string[] {
  return [...text.matchAll(WILDCARD_IMPORT)].map((match) => `${match[1] ?? ''}.*`);
}

function namesOf(missing: readonly string[]): string {
  const names = missing.map((key) => `\`${key.split('/')[0] ?? key}()\``).join(', ');
  return `method${missing.length === 1 ? '' : 's'} ${names}`;
}

export function readDelegateSkipsDefaultFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  const finding = findingFactory();
  const types = mainSourceTexts(projectRoot, options)
    .filter(({ kotlin }) => !kotlin)
    .flatMap(({ file, text }) => {
      const clean = blankLiterals(text);
      return declarationsOf(parseSource(text, { file, kotlin: false }), {
        file,
        pkg: packageOf(clean),
        imports: [...importsOf(clean), ...wildcardImports(clean)],
      });
    });
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

export const DELEGATE_SKIPS_DEFAULT_ALLOWED = skipMessage('<Interface>', '<delegate>', 'methods');
