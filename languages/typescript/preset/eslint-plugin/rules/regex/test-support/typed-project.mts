import { type TypedRuleTester } from '../../../test-support/rule-tester.mts';
import { typedTsProject } from '../../../test-support/projects/typed-ts-project.mts';

type RegexErrors = { messageId: string; data: Record<string, string> }[];

type RegexCase = { filename: string; code: string };

type RegexErrorCase = RegexCase & { errors: RegexErrors };

type TypedRegexCase = {
  (code: string): RegexCase;
  (code: string, errors: RegexErrors): RegexErrorCase;
};

type TypedRegexProject = {
  tester: TypedRuleTester;
  typed: TypedRegexCase;
  typedJs: TypedRegexCase;
};

export function typedRegexProject(prefix: string): TypedRegexProject {
  const { tester, write } = typedTsProject(prefix);

  function typed(code: string): RegexCase;
  function typed(code: string, errors: RegexErrors): RegexErrorCase;
  function typed(code: string, errors?: RegexErrors) {
    return { filename: write(code, 'ts'), code, ...(errors === undefined ? {} : { errors }) };
  }

  function typedJs(code: string): RegexCase;
  function typedJs(code: string, errors: RegexErrors): RegexErrorCase;
  function typedJs(code: string, errors?: RegexErrors) {
    return { filename: write(code, 'js'), code, ...(errors === undefined ? {} : { errors }) };
  }

  return { tester, typed, typedJs };
}
