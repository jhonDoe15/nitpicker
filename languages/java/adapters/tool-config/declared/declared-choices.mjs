import { readFileSync } from 'node:fs';
import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mjs';
import { BUILD_DECLARED_TOOLS } from '../../gradle-presets.mjs';
import { directorySource, readDeclaredBuild } from './declared-build.mjs';
import { ERRORPRONE } from './errorprone-declared.mjs';
import { SPOTBUGS } from './spotbugs-declared.mjs';

const TOOLS = { spotbugs: SPOTBUGS, errorprone: ERRORPRONE };

function requireReadablePoms(build) {
  const broken = build.poms.find((pom) => pom.failure !== undefined);
  if (broken !== undefined) {
    throw new Error(`Could not read ${broken.file}: ${broken.failure}`);
  }
}

export function declaredToolChoices(projectRoot, { toolPrecedence = {}, policyRoot } = {}) {
  const root = policyRoot ?? projectRoot;
  const chosen = BUILD_DECLARED_TOOLS.map((tool) => [
    tool,
    precedenceLayers(toolPrecedence[tool]),
  ]).filter(([, layers]) => layers.usesProject);
  if (chosen.length === 0) {
    return {};
  }
  const build = readDeclaredBuild(directorySource(root));
  requireReadablePoms(build);
  return Object.fromEntries(
    chosen.map(([tool, layers]) => [tool, TOOLS[tool].choice(build, { layers, root })]),
  );
}

function fileContents(files) {
  return files.map((file) => readFileSync(file, 'utf8'));
}

export function declaredToolDigest(toolPrecedence, policyRoot) {
  try {
    const choices = declaredToolChoices(policyRoot, { toolPrecedence, policyRoot });
    return JSON.stringify(
      Object.entries(choices).map(([tool, choice]) => [
        tool,
        choice.arguments,
        fileContents(choice.files),
      ]),
    );
  } catch (error) {
    return error.message;
  }
}

function filesOf(declarations) {
  return [...new Set(declarations.map((declaration) => declaration.file))].join(', ');
}

export function declaredToolNotices(config, source) {
  const build = readDeclaredBuild(source);
  return BUILD_DECLARED_TOOLS.flatMap((tool) => {
    const declarations = TOOLS[tool].declarations(build);
    if (declarations.length === 0) {
      return [];
    }
    const layers = precedenceLayers(config.tools?.[tool]?.precedence);
    return layers.usesProject
      ? TOOLS[tool].notice(declarations, layers)
      : [
          ignoredConfigNotice(
            `the ${TOOLS[tool].label} settings in ${filesOf(declarations)}`,
            tool,
          ),
        ];
  });
}

function pathsOf(declarations) {
  return declarations.flatMap((declaration) =>
    declaration.path === undefined ? [] : [declaration.path],
  );
}

export function declaredConfigFiles(tool, { root, files }) {
  const declarations = TOOLS[tool].declarations(
    readDeclaredBuild({ paths: () => files, readMany: directorySource(root).readMany }),
  );
  const byFile = Object.groupBy(declarations, (declaration) => declaration.file);
  return {
    declarations: new Map(
      Object.entries(byFile).map(([file, found]) => [
        file,
        JSON.stringify(found.map(({ setting, value, path }) => ({ setting, value, path }))),
      ]),
    ),
    files: pathsOf(declarations),
  };
}
