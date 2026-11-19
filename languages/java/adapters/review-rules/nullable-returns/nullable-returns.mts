import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { mainSourceTexts, packageOf } from '../java-sources.mts';
import { parseSource } from '../max-value-sums/source-file.mts';
import { classesOf } from './declarations.mts';
import { documentedNullable, nullableOf } from './returns.mts';
import { sitesIn } from './uses.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';
import type { MethodInfo, Nullable } from './declarations.mts';
import type { FileModel, ProjectClass, Target, Use } from './uses.mts';

export const NULLABLE_RETURN_RULE = 'NullableReturnUse';
export const NULLABLE_RETURN_EXCEPTION_RULE = `pmd/${NULLABLE_RETURN_RULE}`;

const WHERE = {
  return: 'returns `null` on line',
  local: 'returns a local that is still `null` on some path, on line',
  javadoc: 'documents that it may return `null`, on line',
};
const MAX_ALONE = 2;
const MIN_CHECKING = 3;

const IMPORT = /^\s*import\s+([\w.]+(?:\.\*)?)\s*;/gmu;

function importsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)].map((match) => match[1] ?? '');
}

const STATIC_IMPORT = /^\s*import\s+static\s+([\w.]+)\.(\w+)\s*;/gmu;

function staticsOf(text: string): Map<string, string> {
  return new Map(
    [...text.matchAll(STATIC_IMPORT)].map((match) => [match[2] ?? '', match[1] ?? '']),
  );
}

type MessageParts = {
  readonly method: string;
  readonly where: string;
  readonly subject: string;
  readonly form: string;
  readonly value: string;
  readonly sure: boolean;
};

function nullableReturnMessage({
  method,
  where,
  subject,
  form,
  value,
  sure,
}: MessageParts): string {
  const verb = sure ? 'throws' : 'can throw';
  return (
    `\`${method}\` ${where}, and ${subject} is ${form} here without a null check, which ${verb} ` +
    `NullPointerException on that path; add \`if (${value} == null) return ...;\` or annotate the ` +
    `method \`@Nullable\` and handle it. If the caller knows from context that the value is set, ` +
    `add \`Objects.requireNonNull(${value}, "why")\` to document it.`
  );
}

function messageOf({ target, use }: { target: Target; use: Use }, { where, sure }: Origin): string {
  const name = `${target.owner}.${target.method.name}`;
  return nullableReturnMessage({
    method: name,
    where,
    subject: use.variable === undefined ? `the result of \`${name}\`` : `\`${use.variable}\``,
    form: use.form,
    value: use.variable ?? 'result',
    sure,
  });
}

export const NULLABLE_RETURN_ALLOWED = nullableReturnMessage({
  method: '<Owner>.<method>',
  where: 'can return `null`',
  subject: '`<value>`',
  form: 'dereferenced',
  value: '<value>',
  sure: true,
});

type ModelledFile = { readonly file: string; readonly model: FileModel };

function modelOf(file: string, text: string): ModelledFile {
  const source = parseSource(text, { file, kotlin: false });
  const pkg = packageOf(text);
  const documented = documentedNullable(text);
  const classes = classesOf(source, pkg).map((cls): ProjectClass => {
    const nullable = new Map<MethodInfo, Nullable>();
    for (const method of cls.methods) {
      const found = nullableOf(source, method, documented);
      if (found !== undefined) {
        nullable.set(method, found);
      }
    }
    return { ...cls, file, source, nullable };
  });
  return {
    file,
    model: { source, pkg, imports: importsOf(text), statics: staticsOf(text), classes },
  };
}

function lookupOf(files: readonly ModelledFile[]): Map<string, ProjectClass[]> {
  const lookup = new Map<string, ProjectClass[]>();
  for (const cls of files.flatMap(({ model }) => model.classes)) {
    lookup.set(cls.name, [...(lookup.get(cls.name) ?? []), cls]);
  }
  return lookup;
}

export type SourceText = { readonly file: string; readonly text: string };

export type Reported = {
  readonly callers: { readonly total: number; readonly checked: number };
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly message: string;
};

type Origin = { readonly where: string; readonly sure: boolean };

function originOf(target: Target, counts: { total: number; checked: number }): Origin | undefined {
  const { nullable } = target;
  if (nullable === undefined) {
    const mostly = counts.checked >= MIN_CHECKING && counts.checked * 5 >= counts.total * 4;
    const where = `is null-checked by ${String(counts.checked)} of its ${String(counts.total)} callers`;
    return mostly ? { where, sure: false } : undefined;
  }
  const peers = counts.checked >= 1 && counts.checked * 2 >= counts.total;
  const alone = counts.total <= MAX_ALONE && nullable.why !== 'return';
  const where = `${WHERE[nullable.why]} ${String(nullable.line)} of ${target.file}`;
  if (peers) {
    return { where: `${where}, and other callers check it`, sure: false };
  }
  return alone ? { where, sure: true } : undefined;
}

export function nullableReturnUses(sources: readonly SourceText[]): Reported[] {
  const files = sources.map(({ file, text }) => modelOf(file, text));
  const lookup = lookupOf(files);
  const sites = files.flatMap(({ file, model }) =>
    sitesIn(model, lookup).map((site) => ({ file, ...site })),
  );
  const counts = new Map<string, { total: number; checked: number }>();
  for (const { target, outcome } of sites) {
    const seen = counts.get(target.key) ?? { total: 0, checked: 0 };
    counts.set(target.key, {
      total: seen.total + 1,
      checked: seen.checked + (outcome === 'checked' ? 1 : 0),
    });
  }
  const reported = new Set<string>();
  return sites.flatMap(({ file, target, use }) => {
    const callers = counts.get(target.key) ?? { total: 0, checked: 0 };
    const origin = use === undefined ? undefined : originOf(target, callers);
    const symbol = `${target.owner}.${target.method.name}`;
    const identity = `${file}:${String(use?.line)}:${symbol}`;
    if (use === undefined || origin === undefined || reported.has(identity)) {
      return [];
    }
    reported.add(identity);
    return [{ callers, file, line: use.line, symbol, message: messageOf({ target, use }, origin) }];
  });
}

export function readNullableReturnFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  const finding = findingFactory();
  const javaFiles = mainSourceTexts(projectRoot, { ...options, kotlin: false }).filter(({ file }) =>
    file.endsWith('.java'),
  );
  return nullableReturnUses(javaFiles).map(({ file, line, symbol, message }) =>
    finding({
      rule: NULLABLE_RETURN_RULE,
      file,
      line,
      symbol,
      key: `${file}:${String(line)}:${symbol}`,
      message,
    }),
  );
}
