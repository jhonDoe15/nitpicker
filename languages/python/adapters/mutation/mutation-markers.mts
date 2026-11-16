import { hashIdentity as untypedHash } from '../../../../shared/ingest/common.mjs';
import { escapeRegExp as untypedEscape } from '../../../../shared/paths/glob.mjs';
import { readProjectFile } from '../../libraries/project-files.mts';
import { listProductionModules } from '../analysis/python-sources.mts';
import { readMutmutConfig } from '../project-tools/mutmut/mutmut-config.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import type { Fields } from '../../../../shared/values/readers.mts';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';

type Ignored = {
  readonly file: string;
  readonly identity: string;
  readonly line?: number;
  readonly message: string;
};
type Options = { readonly file: string; readonly section: string; readonly options: Fields };

const hashIdentity: (prefix: string, parts: string[]) => string = untypedHash;
const escapeRegExp: (value: string) => string = untypedEscape;

const MUTMUT_TOOL = 'mutmut';
const MUTANT_IGNORED_RULE = 'mutant-ignored';
const NO_MUTATE = /#\s*pragma:\s*no mutate\b(?:[ \t]+(block|start|end|class|function))?/u;
const NOT_A_ROUTE =
  'Remove it and test the code. Ignore comments and patterns are not an exception route.';
const PYPROJECT = 'pyproject.toml';

function ignoredFinding({ file, identity, line, message }: Ignored): IngestedFinding {
  return {
    tool: MUTMUT_TOOL,
    rule: MUTANT_IGNORED_RULE,
    path: file,
    identity,
    message: `${message} ${NOT_A_ROUTE}`,
    classification: 'enforceable',
    ...(line === undefined ? {} : { location: { line } }),
  };
}

function pragmaFindings(projectRoot: string, file: string): IngestedFinding[] {
  const occurrences = new Map<string, number>();
  return (readProjectFile(projectRoot, file) ?? '').split(/\r?\n/u).flatMap((text, index) => {
    const match = NO_MUTATE.exec(text);
    if (match === null) {
      return [];
    }
    const key = hashIdentity('no-mutate', [text.trim()]);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    const scope = match[1] === undefined ? 'this line' : `this ${match[1]}`;
    return [
      ignoredFinding({
        file,
        identity: occurrence === 1 ? key : `${key}#${String(occurrence)}`,
        line: index + 1,
        message: `\`${match[0]}\` hides ${scope} from mutation testing.`,
      }),
    ];
  });
}

function fnmatch(pattern: string): RegExp {
  const source = Array.from(pattern)
    .map((character) => {
      if (character === '*') {
        return '.*';
      }
      if (character === '?') {
        return '.';
      }
      return escapeRegExp(character);
    })
    .join('');
  return new RegExp(`^${source}$`, 'u');
}

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return textOf(value ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readOptions(projectRoot: string): Options | undefined {
  const config = readMutmutConfig(projectRoot);
  return config === undefined
    ? undefined
    : {
        file: config.file,
        section: config.file === PYPROJECT ? '[tool.mutmut]' : '[mutmut]',
        options: config.table,
      };
}

export function mutmutDoNotMutate(
  projectRoot: string,
):
  | { file: string; patterns: string[]; matches: (file: string, pattern: string) => boolean }
  | undefined {
  const config = readOptions(projectRoot);
  return config === undefined
    ? undefined
    : {
        file: config.file,
        patterns: listOf(config.options['do_not_mutate']),
        matches: (file: string, pattern: string) => fnmatch(pattern).test(file),
      };
}

function isTrue(value: unknown): boolean {
  return value === true || /^(?:true|1|yes|on)$/iu.test(textOf(value ?? ''));
}

function configFindings(config: Options, files: readonly string[]): IngestedFinding[] {
  const patterns = listOf(config.options['do_not_mutate']);
  const hidden = files.flatMap((file) => {
    const pattern = patterns.find((candidate) => fnmatch(candidate).test(file));
    return pattern === undefined
      ? []
      : [
          ignoredFinding({
            file,
            identity: `do-not-mutate:${pattern}`,
            message: `do_not_mutate pattern "${pattern}" in ${config.section} of ${config.file} hides this file from mutation testing.`,
          }),
        ];
  });
  const coveredOnly = isTrue(config.options['mutate_only_covered_lines'])
    ? [
        ignoredFinding({
          file: config.file,
          identity: 'mutate-only-covered-lines',
          message: `mutate_only_covered_lines in ${config.section} of ${config.file} hides the code no test runs from mutation testing.`,
        }),
      ]
    : [];
  return [...hidden, ...coveredOnly];
}

export function mutationMarkerFindings({
  projectRoot,
  project,
}: {
  readonly projectRoot: string;
  readonly project: { readonly sourceRoots: readonly string[] };
}): IngestedFinding[] {
  const files = listProductionModules(projectRoot, project.sourceRoots).map(({ file }) => file);
  const config = readOptions(projectRoot);
  return [
    ...files.flatMap((file) => pragmaFindings(projectRoot, file)),
    ...(config === undefined ? [] : configFindings(config, files)),
  ];
}
