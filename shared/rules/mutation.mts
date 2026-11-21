import { ENFORCED_MUTATION_STATUSES, mutantRuleId } from '../policy.mts';
import { exceptionHint } from './exceptions.mts';
import type { Finding } from '../values/findings.mts';
import { fieldsOf, textOf } from '../values/readers.mts';
import { locationFrom, positiveInteger } from './finding-parts.mts';

const REPLACEMENT_LIMIT = 80;
const HIDDEN_BY_COMMENT_PROBLEM = 'an ignore comment hides this code from mutation testing.';
const HIDDEN_BY_COMMENT_FORM =
  'Remove the comment and test the code; an ignore comment is not an exception route.';
const NO_COVERAGE_FORM = 'Add a test that reaches it.';
const EQUIVALENT_MUTANT_WAY_OUT =
  'If no input can tell the two apart, simplify the code so this mutant disappears.';

type Mutant = {
  readonly path?: unknown;
  readonly identity?: unknown;
  readonly status?: unknown;
  readonly label?: unknown;
  readonly line?: unknown;
  readonly column?: unknown;
  readonly symbol?: unknown;
  readonly anchor?: unknown;
  readonly original?: unknown;
  readonly replacement?: unknown;
  readonly hiddenByComment?: unknown;
};

type MutantOptions = { readonly tool: string; readonly wayOut?: string };

type Advice = { readonly text: string; readonly allowedForm?: string };

export function mutantFindings(
  mutants: readonly unknown[],
  { tool, wayOut = EQUIVALENT_MUTANT_WAY_OUT }: MutantOptions,
): Finding[] {
  return mutants.map((entry) => {
    const mutant: Mutant = fieldsOf(entry);
    const { text, allowedForm } = mutantAdvice(mutant, wayOut);
    const status = textOf(mutant.status);
    return {
      tool,
      rule: mutantRuleId(status),
      path: textOf(mutant.path),
      identity: textOf(mutant.identity),
      message: text,
      ...(allowedForm === undefined ? {} : { allowedForm }),
      classification:
        ENFORCED_MUTATION_STATUSES.includes(status) || mutant.hiddenByComment === true
          ? 'enforceable'
          : 'descriptive',
      ...(mutant.symbol === undefined ? {} : { symbol: textOf(mutant.symbol) }),
      ...(mutant.anchor === undefined
        ? {}
        : { anchor: { key: `mutant:${textOf(mutant.anchor)}`, requireUnchangedLine: true } }),
      ...mutantLocation(mutant),
    };
  });
}

function mutantLocation({ line, column }: Mutant): ReturnType<typeof locationFrom> {
  return locationFrom(line, column, 'column');
}

const EMPTY_STRING_FORMS = new Set(['', "''", '""', '``']);

function inlineCode(value: unknown): string {
  const text = String(value).replaceAll(/\s+/gu, ' ').trim();
  const shown = text.length > REPLACEMENT_LIMIT ? `${text.slice(0, REPLACEMENT_LIMIT)}…` : text;
  if (EMPTY_STRING_FORMS.has(shown)) {
    return "`''` (an empty string)";
  }
  return shown.includes('`') ? `\`\` ${shown} \`\`` : `\`${shown}\``;
}

function mutantAdvice(
  { path, status, label, replacement, original, column, hiddenByComment }: Mutant,
  wayOut: string,
): Advice {
  const name = `${textOf(status)} ${textOf(label)}${positiveInteger(column) === undefined ? '' : ` at column ${String(column)}`}`;
  if (hiddenByComment === true) {
    return {
      text: `${name}: ${HIDDEN_BY_COMMENT_PROBLEM} ${HIDDEN_BY_COMMENT_FORM} ${exceptionHint('mutant-ignored', textOf(path))}`,
      allowedForm: HIDDEN_BY_COMMENT_FORM,
    };
  }
  if (status === 'NoCoverage') {
    return {
      text: `${name}: no test runs this code. ${NO_COVERAGE_FORM}`,
      allowedForm: NO_COVERAGE_FORM,
    };
  }
  if (status !== 'Survived') {
    return { text: name };
  }
  const allowedForm = `Add an assertion that would. ${wayOut}`;
  if (replacement === undefined) {
    return { text: `${name}: no test fails when this code changes. ${allowedForm}`, allowedForm };
  }
  const subject = original === undefined ? 'this code' : inlineCode(original);
  return {
    text: `${name}: replacing ${subject} with ${inlineCode(replacement)} fails no test. ${allowedForm}`,
    allowedForm,
  };
}

export function mutantMessage(mutant: Mutant, wayOut = EQUIVALENT_MUTANT_WAY_OUT): string {
  return mutantAdvice(mutant, wayOut).text;
}
