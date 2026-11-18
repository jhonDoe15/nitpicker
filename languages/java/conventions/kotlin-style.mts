import { precedenceLayers } from '../../../shared/conventions/tool-precedence.mjs';
import type { ConventionSource } from '../../../core/conventions/typed/convention-types.mts';
import type { NitpickerConfig } from '../../../shared/values/config-types.mts';
import { fieldOf, messageOf, optionalText } from '../../../shared/values/readers.mts';
import {
  declaredStyleOf,
  detectedFormatter,
  detektConfigFile,
  editorconfigOf,
  filesOfProject,
  filesOfSource,
  isMaven,
  kotlinSummaryOf,
  kotlinToolsOf,
  ktfmtIndentation,
  mavenFormatter,
  mavenKtfmtStyle,
  readInsideRoot,
} from './typed/kotlin-views.mts';
import {
  detektMaxLineLength,
  detektWildcardActive,
  kotlinEditorconfigValues,
} from './editorconfig-values.mts';
import {
  KOTLIN_INDENTATION,
  KOTLIN_LINE_LENGTH,
  KOTLIN_TRAILING_COMMAS,
  KOTLIN_WILDCARD_IMPORTS,
} from './kotlin-conventions.mts';

type Choices = Record<string, { choice: string; from: string }>;
type Tools = NonNullable<NitpickerConfig['tools']>;
type ConfigRoot = { path: string; snapshot: string };
type KotlinStyleInput = {
  config: NitpickerConfig;
  projectRoot: string;
  source?: ConventionSource | undefined;
  headPolicy?: unknown;
  configRoot?: (() => ConfigRoot) | undefined;
};
type Detected = {
  tools: Tools;
  configured: string | undefined;
  formatter: string | undefined;
  facts: unknown;
  buildFacts: unknown;
};

function choiceOf(table: Record<string, string>, key: string | undefined): string | undefined {
  return key === undefined ? undefined : table[key];
}

const COMMA_CHOICES: Record<string, string> = { true: 'always', false: 'never' };
const WILDCARD_CHOICES: Record<string, string> = { disabled: 'wildcard', enabled: 'explicit' };
const DETEKT_WILDCARD_CHOICES: Record<string, string> = { true: 'explicit', false: 'wildcard' };
const KTFMT = 'ktfmt';
const KTLINT = 'ktlint';
const NO_FORMATTER = 'no Kotlin formatter runs';

function choicesFrom(from: string, candidates: Record<string, string | undefined>): Choices {
  return Object.fromEntries(
    Object.entries(candidates).flatMap(([id, choice]) =>
      choice === undefined ? [] : [[id, { choice, from }]],
    ),
  );
}

function editorconfigValues(root: string): Record<string, string> | undefined {
  const text = editorconfigOf(root);
  return text === undefined ? undefined : kotlinEditorconfigValues(text);
}

function ktlintChoices(root: string): Choices {
  const values = editorconfigValues(root);
  if (values === undefined) {
    return {};
  }
  const commas =
    values['ij_kotlin_allow_trailing_comma'] ??
    values['ij_kotlin_allow_trailing_comma_on_call_site'];
  return choicesFrom('your .editorconfig', {
    [KOTLIN_INDENTATION]: values['indent_size'],
    [KOTLIN_LINE_LENGTH]: values['max_line_length'],
    [KOTLIN_TRAILING_COMMAS]: choiceOf(COMMA_CHOICES, commas),
    [KOTLIN_WILDCARD_IMPORTS]: choiceOf(
      WILDCARD_CHOICES,
      values['ktlint_standard_no-wildcard-imports'],
    ),
  });
}

function ktfmtBuildChoices(declared: string | undefined): Choices {
  return choicesFrom('your build file', {
    [KOTLIN_INDENTATION]: ktfmtIndentation(declared),
  });
}

function ktfmtChoices(root: string): Choices {
  const values = editorconfigValues(root);
  return choicesFrom('your .editorconfig', {
    [KOTLIN_INDENTATION]: values?.['indent_size'],
    [KOTLIN_LINE_LENGTH]: values?.['max_line_length'],
  });
}

function detektChoices(
  { path: root, snapshot }: ConfigRoot,
  configured: string | undefined,
): Choices {
  const file = detektConfigFile(root, configured, snapshot);
  const text = file === undefined ? undefined : readInsideRoot(root, file);
  const active = text === undefined ? undefined : detektWildcardActive(text);
  return choicesFrom('your detekt config', {
    [KOTLIN_WILDCARD_IMPORTS]: choiceOf(
      DETEKT_WILDCARD_CHOICES,
      active === undefined ? undefined : String(active),
    ),
    [KOTLIN_LINE_LENGTH]: text === undefined ? undefined : detektMaxLineLength(text),
  });
}

function unusedFor(formatter: string | undefined): Record<string, string> {
  return {
    ...(formatter === KTLINT
      ? {}
      : {
          [KOTLIN_TRAILING_COMMAS]:
            formatter === KTFMT ? 'ktfmt always adds trailing commas' : NO_FORMATTER,
        }),
    ...(formatter === 'none'
      ? { [KOTLIN_INDENTATION]: NO_FORMATTER, [KOTLIN_LINE_LENGTH]: NO_FORMATTER }
      : {}),
  };
}

function unusedByBoth(base: string | undefined, head: string | undefined): Record<string, string> {
  const baseUnused = unusedFor(base);
  const headUnused = unusedFor(head);
  return Object.fromEntries(Object.entries(baseUnused).filter(([id]) => id in headUnused));
}

function projectWins(tools: Tools, tool: string): boolean {
  const layers = precedenceLayers(tools[tool]?.precedence);
  return layers.usesProject && !layers.nitpickerFirst;
}

function summaryLines(
  { config, projectRoot, facts }: { config: NitpickerConfig; projectRoot: string; facts: unknown },
  conventions: unknown,
): string[] {
  try {
    const toolPrecedence = Object.fromEntries(
      Object.entries(config.tools ?? {}).map(([tool, setting]) => [tool, setting?.precedence]),
    );
    const tools = kotlinToolsOf(projectRoot, {
      formatter: optionalText(config.kotlin?.['formatter']),
      detektConfig: config.kotlin?.detektConfig,
      snapshot: 'head',
      conventions,
      policyRoot: projectRoot,
      toolPrecedence,
      facts,
    });
    return kotlinSummaryOf(tools, conventions);
  } catch (error) {
    return [`Could not read the Kotlin style settings: ${messageOf(error)}`];
  }
}

function headConfigRoot(projectRoot: string): () => ConfigRoot {
  return () => ({ path: projectRoot, snapshot: 'head' });
}

function declaredStyle(facts: unknown, buildFacts: unknown): string | undefined {
  return isMaven(buildFacts) ? mavenKtfmtStyle(buildFacts) : declaredStyleOf(facts);
}

function projectChoices(
  { tools, configured, formatter, facts, buildFacts }: Detected,
  configRoot: () => ConfigRoot,
): Choices {
  const detektListed =
    projectWins(tools, 'detekt') || (configured !== undefined && tools['detekt'] === undefined);
  const ktfmtListed = formatter === KTFMT && projectWins(tools, 'ktfmt');
  const ktlintListed = formatter === KTLINT && projectWins(tools, 'ktlint');
  const root = detektListed || ktfmtListed || ktlintListed ? configRoot() : undefined;
  return {
    ...(formatter === KTFMT ? ktfmtBuildChoices(declaredStyle(facts, buildFacts)) : {}),
    ...(detektListed && root !== undefined ? detektChoices(root, configured) : {}),
    ...(ktfmtListed && root !== undefined ? ktfmtChoices(root.path) : {}),
    ...(ktlintListed && root !== undefined ? ktlintChoices(root.path) : {}),
  };
}

function formatters({
  config,
  projectRoot,
  source,
  buildFacts,
}: KotlinStyleInput & { buildFacts: unknown }): {
  facts: unknown;
  formatter: string | undefined;
  headFormatter: string | undefined;
} {
  const configured = optionalText(config.kotlin?.['formatter']);
  if (isMaven(buildFacts)) {
    return {
      facts: undefined,
      formatter: mavenFormatter(buildFacts),
      headFormatter: mavenFormatter(buildFacts),
    };
  }
  const facts = filesOfSource(source, projectRoot);
  return {
    facts,
    formatter: configured ?? detectedFormatter(facts),
    headFormatter: configured ?? detectedFormatter(filesOfProject(projectRoot)),
  };
}

export function kotlinStyle({
  config,
  projectRoot,
  source,
  headPolicy,
  configRoot = headConfigRoot(projectRoot),
}: KotlinStyleInput): {
  unused: Record<string, string>;
  project: Choices;
  note: () => undefined;
  summary: (conventions: unknown) => string[];
} {
  const configured = config.kotlin?.detektConfig;
  const buildFacts = fieldOf(headPolicy, 'kotlin');
  const found = formatters({ config, projectRoot, source, buildFacts });
  return {
    unused: unusedByBoth(found.formatter, found.headFormatter),
    project: projectChoices(
      {
        tools: config.tools ?? {},
        configured,
        formatter: found.formatter,
        facts: found.facts,
        buildFacts,
      },
      configRoot,
    ),
    note: () => undefined,
    summary: (conventions: unknown) =>
      summaryLines({ config, projectRoot, facts: buildFacts }, conventions),
  };
}
