import { readInside } from '../../../shared/conventions/read-inside.mjs';
import { precedenceLayers } from '../../../shared/conventions/tool-precedence.mjs';
import { projectEditorconfig } from '../adapters/kotlin/style/kotlin-style-files.mjs';
import { detektConfigOf, resolveKotlinTools } from '../adapters/kotlin/kotlin-tools.mjs';
import {
  declaredKtfmtStyle,
  detectFormatter,
  isMavenFacts,
  kotlinFilesFromSource,
  kotlinFilesOf,
  KTFMT_STYLE_INDENTATION,
} from '../adapters/kotlin/style/kotlin-build-text.mjs';
import { kotlinSummary } from '../adapters/kotlin/style/kotlin-format-advice.mjs';
import {
  detektMaxLineLength,
  detektWildcardActive,
  kotlinEditorconfigValues,
} from './editorconfig-values.mjs';
import {
  KOTLIN_INDENTATION,
  KOTLIN_LINE_LENGTH,
  KOTLIN_TRAILING_COMMAS,
  KOTLIN_WILDCARD_IMPORTS,
} from './kotlin-conventions.mjs';

const COMMA_CHOICES = { true: 'always', false: 'never' };
const WILDCARD_CHOICES = { disabled: 'wildcard', enabled: 'explicit' };
const DETEKT_WILDCARD_CHOICES = { true: 'explicit', false: 'wildcard' };
const NO_FORMATTER = 'no Kotlin formatter runs';

function choicesFrom(from, candidates) {
  return Object.fromEntries(
    Object.entries(candidates)
      .filter(([, choice]) => choice !== undefined)
      .map(([id, choice]) => [id, { choice, from }]),
  );
}

function editorconfigValues(root) {
  const text = projectEditorconfig(root);
  return text === undefined ? undefined : kotlinEditorconfigValues(text);
}

function ktlintChoices(root) {
  const values = editorconfigValues(root);
  if (values === undefined) {
    return {};
  }
  const commas =
    values.ij_kotlin_allow_trailing_comma ?? values.ij_kotlin_allow_trailing_comma_on_call_site;
  return choicesFrom('your .editorconfig', {
    [KOTLIN_INDENTATION]: values.indent_size,
    [KOTLIN_LINE_LENGTH]: values.max_line_length,
    [KOTLIN_TRAILING_COMMAS]: COMMA_CHOICES[commas],
    [KOTLIN_WILDCARD_IMPORTS]: WILDCARD_CHOICES[values['ktlint_standard_no-wildcard-imports']],
  });
}

function ktfmtBuildChoices(declared) {
  return choicesFrom('your build file', {
    [KOTLIN_INDENTATION]: KTFMT_STYLE_INDENTATION[declared],
  });
}

function ktfmtChoices(root) {
  const values = editorconfigValues(root);
  return choicesFrom('your .editorconfig', {
    [KOTLIN_INDENTATION]: values?.indent_size,
    [KOTLIN_LINE_LENGTH]: values?.max_line_length,
  });
}

function detektChoices({ path: root, snapshot }, configured) {
  const file = detektConfigOf(root, configured, snapshot);
  const text = file === undefined ? undefined : readInside(root, file, 'utf8');
  const active = text === undefined ? undefined : detektWildcardActive(text);
  return choicesFrom('your detekt config', {
    [KOTLIN_WILDCARD_IMPORTS]: DETEKT_WILDCARD_CHOICES[active],
    [KOTLIN_LINE_LENGTH]: text === undefined ? undefined : detektMaxLineLength(text),
  });
}

function unusedFor(formatter) {
  return {
    ...(formatter === 'ktlint'
      ? {}
      : {
          [KOTLIN_TRAILING_COMMAS]:
            formatter === 'ktfmt' ? 'ktfmt always adds trailing commas' : NO_FORMATTER,
        }),
    ...(formatter === 'none'
      ? { [KOTLIN_INDENTATION]: NO_FORMATTER, [KOTLIN_LINE_LENGTH]: NO_FORMATTER }
      : {}),
  };
}

function unusedByBoth(base, head) {
  const baseUnused = unusedFor(base);
  const headUnused = unusedFor(head);
  return Object.fromEntries(Object.entries(baseUnused).filter(([id]) => id in headUnused));
}

function projectWins(tools, tool) {
  const layers = precedenceLayers(tools[tool]?.precedence);
  return layers.usesProject && !layers.nitpickerFirst;
}

function summaryLines({ config, projectRoot, facts }, conventions) {
  try {
    const toolPrecedence = Object.fromEntries(
      Object.entries(config.tools ?? {}).map(([tool, { precedence }]) => [tool, precedence]),
    );
    const tools = resolveKotlinTools(projectRoot, {
      formatter: config.kotlin?.formatter,
      detektConfig: config.kotlin?.detektConfig,
      snapshot: 'head',
      conventions,
      policyRoot: projectRoot,
      toolPrecedence,
      facts,
    });
    return kotlinSummary(tools, conventions);
  } catch (error) {
    return [`Could not read the Kotlin style settings: ${error.message}`];
  }
}

function headConfigRoot(projectRoot) {
  return () => ({ path: projectRoot, snapshot: 'head' });
}

function formatterFacts(source, projectRoot) {
  return source === undefined ? kotlinFilesOf(projectRoot) : kotlinFilesFromSource(source);
}

function declaredStyle(facts, buildFacts) {
  return isMavenFacts(buildFacts) ? buildFacts.ktfmtStyle : declaredKtfmtStyle(facts);
}

function projectChoices({ tools, configured, formatter, facts, buildFacts }, configRoot) {
  const detektListed =
    projectWins(tools, 'detekt') || (configured !== undefined && tools.detekt === undefined);
  const ktfmtListed = formatter === 'ktfmt' && projectWins(tools, 'ktfmt');
  const ktlintListed = formatter === 'ktlint' && projectWins(tools, 'ktlint');
  const root = detektListed || ktfmtListed || ktlintListed ? configRoot() : undefined;
  return {
    ...(formatter === 'ktfmt' ? ktfmtBuildChoices(declaredStyle(facts, buildFacts)) : {}),
    ...(detektListed ? detektChoices(root, configured) : {}),
    ...(ktfmtListed ? ktfmtChoices(root.path) : {}),
    ...(ktlintListed ? ktlintChoices(root.path) : {}),
  };
}

function formatters({ config, projectRoot, source, buildFacts }) {
  const configured = config.kotlin?.formatter;
  if (isMavenFacts(buildFacts)) {
    return {
      facts: undefined,
      formatter: buildFacts.formatter,
      headFormatter: buildFacts.formatter,
    };
  }
  const facts = formatterFacts(source, projectRoot);
  return {
    facts,
    formatter: configured ?? detectFormatter(facts),
    headFormatter: configured ?? detectFormatter(kotlinFilesOf(projectRoot)),
  };
}

export function kotlinStyle({
  config,
  projectRoot,
  source,
  headPolicy,
  configRoot = headConfigRoot(projectRoot),
}) {
  const configured = config.kotlin?.detektConfig;
  const buildFacts = headPolicy?.kotlin;
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
    summary: (conventions) => summaryLines({ config, projectRoot, facts: buildFacts }, conventions),
  };
}
