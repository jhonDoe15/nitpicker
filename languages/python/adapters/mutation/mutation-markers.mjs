import { hashIdentity } from '../../../java/ingest/common.mjs';
import { readProjectFile, toml } from '../../libraries/project-files.mjs';
import { listProductionModules } from '../analysis/python-sources.mjs';
import { parseIni } from '../configuration/mypy-config.mjs';

const MUTMUT_TOOL = 'mutmut';
const MUTANT_IGNORED_RULE = 'mutant-ignored';
const NO_MUTATE = /#\s*pragma:\s*no mutate\b(?:[ \t]+(block|start|end|class|function))?/u;
const NOT_A_ROUTE =
  'Remove it and test the code. Ignore comments and patterns are not an exception route.';
const PYPROJECT = 'pyproject.toml';
const SETUP_CFG = 'setup.cfg';

function ignoredFinding({ file, identity, line, message }) {
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

function pragmaFindings(projectRoot, file) {
  const occurrences = new Map();
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

function fnmatch(pattern) {
  const source = Array.from(pattern)
    .map((character) => {
      if (character === '*') {
        return '.*';
      }
      if (character === '?') {
        return '.';
      }
      return character.replaceAll(/[.+^${}()|[\]\\]/gu, String.raw`\$&`);
    })
    .join('');
  return new RegExp(`^${source}$`, 'u');
}

function listOf(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return String(value ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readOptions(projectRoot) {
  const pyproject = readProjectFile(projectRoot, PYPROJECT);
  const mutmut = pyproject === undefined ? undefined : toml().parse(pyproject).tool?.mutmut;
  if (mutmut !== undefined) {
    return { file: PYPROJECT, section: '[tool.mutmut]', options: mutmut };
  }
  const setupCfg = readProjectFile(projectRoot, SETUP_CFG);
  const section = setupCfg === undefined ? undefined : parseIni(setupCfg).get('mutmut');
  return section === undefined
    ? undefined
    : { file: SETUP_CFG, section: '[mutmut]', options: Object.fromEntries(section) };
}

export function mutmutDoNotMutate(projectRoot) {
  const config = readOptions(projectRoot);
  return config === undefined
    ? undefined
    : {
        file: config.file,
        patterns: listOf(config.options.do_not_mutate),
        matches: (file, pattern) => fnmatch(pattern).test(file),
      };
}

function isTrue(value) {
  return value === true || /^(?:true|1|yes|on)$/iu.test(String(value ?? ''));
}

function configFindings(config, files) {
  const patterns = listOf(config.options.do_not_mutate);
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
  const coveredOnly = isTrue(config.options.mutate_only_covered_lines)
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

/**
 * What hides production code from mutmut: `# pragma: no mutate` comments, and the project's own
 * [tool.mutmut] (or setup.cfg [mutmut]) do_not_mutate patterns and mutate_only_covered_lines.
 * Each is an enforceable mutant-ignored finding, the way the TypeScript preset reports a Stryker
 * disable comment. Read before nitpicker writes its own [tool.mutmut], so only the project's
 * settings count.
 */
export function mutationMarkerFindings({ projectRoot, project }) {
  const files = listProductionModules(projectRoot, project.sourceRoots).map(({ file }) => file);
  const config = readOptions(projectRoot);
  return [
    ...files.flatMap((file) => pragmaFindings(projectRoot, file)),
    ...(config === undefined ? [] : configFindings(config, files)),
  ];
}
