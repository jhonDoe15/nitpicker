import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ignoredConfigNotice as untypedIgnoredConfigNotice,
  precedenceLayers as untypedPrecedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mjs';
import { fieldOf, messageOf, textOf } from '../../../../../shared/values/readers.mts';
import type {
  BuildSource,
  DeclaredBuild,
  DeclaredPolicy,
  Declaration,
  PrecedenceLayers,
  ToolChoice,
  ToolSpec,
} from './declared-types.mts';
import { BUILD_DECLARED_TOOLS } from '../../gradle-presets.mts';
import { directorySource, readDeclaredBuild } from './declared-build.mts';
import { ERRORPRONE } from './errorprone/errorprone-declared.mts';
import { PIT } from './pit-declared.mts';
import { SPOTBUGS } from './spotbugs-declared.mts';
import { TESTS } from './test-retries-declared.mts';

const layersOf: (precedence?: string[]) => PrecedenceLayers = untypedPrecedenceLayers;
function precedenceLayers(precedence: readonly string[] | undefined): PrecedenceLayers {
  return layersOf(precedence === undefined ? undefined : [...precedence]);
}

const ignoredConfigNotice: (ignored: string, tool: string) => string = untypedIgnoredConfigNotice;

const TOOLS: Readonly<Record<string, ToolSpec | undefined>> = {
  spotbugs: SPOTBUGS,
  errorprone: ERRORPRONE,
  pit: PIT,
  tests: TESTS,
};

function requireReadablePoms(build: DeclaredBuild): void {
  const broken = build.poms.find((pom) => pom.failure !== undefined);
  if (broken !== undefined) {
    throw new Error(`Could not read ${broken.file}: ${broken.failure ?? ''}`);
  }
}

export function declaredToolChoices(
  projectRoot: string,
  { toolPrecedence = {}, policyRoot }: DeclaredPolicy = {},
): Record<string, ToolChoice> {
  const root = policyRoot ?? projectRoot;
  const chosen = BUILD_DECLARED_TOOLS.map((tool): [string, PrecedenceLayers] => [
    tool,
    precedenceLayers(toolPrecedence[tool]),
  ]).filter(([, layers]) => layers.usesProject);
  if (chosen.length === 0) {
    return {};
  }
  const build = readDeclaredBuild(directorySource(root));
  requireReadablePoms(build);
  return Object.fromEntries(
    chosen.map(([tool, layers]) => [tool, toolOf(tool).choice(build, { layers, root })]),
  );
}

function toolOf(tool: string): ToolSpec {
  const found = TOOLS[tool];
  if (found === undefined) {
    throw new Error(`Unknown declared tool ${tool}`);
  }
  return found;
}

function portable(argument: string, policyRoot: string): string {
  return path.isAbsolute(argument) ? path.relative(policyRoot, argument) : argument;
}

function fileContents(files: readonly string[]): string[] {
  return files.map((file) => readFileSync(file, 'utf8'));
}

export function declaredToolDigest(
  toolPrecedence: DeclaredPolicy['toolPrecedence'],
  policyRoot: string,
): string {
  try {
    const choices = declaredToolChoices(policyRoot, { toolPrecedence, policyRoot });
    return JSON.stringify(
      Object.entries(choices).map(([tool, choice]) => [
        tool,
        Array.isArray(choice.arguments)
          ? choice.arguments.map((argument: unknown) => portable(textOf(argument), policyRoot))
          : choice.arguments,
        fileContents(choice.files),
      ]),
    );
  } catch (error) {
    return messageOf(error);
  }
}

function filesOf(declarations: readonly Declaration[]): string {
  return [...new Set(declarations.map((declaration) => declaration.file))].join(', ');
}

export function declaredToolNotices(config: unknown, source: BuildSource): string[] {
  const build = readDeclaredBuild(source);
  return BUILD_DECLARED_TOOLS.flatMap((tool) => {
    const spec = toolOf(tool);
    const declarations = spec.declarations(build);
    const relevant = spec.noticeable?.(declarations) ?? declarations;
    if (relevant.length === 0) {
      return [];
    }
    const precedence = fieldOf(fieldOf(fieldOf(config, 'tools'), tool), 'precedence');
    const layers = precedenceLayers(
      Array.isArray(precedence) ? precedence.map((entry: unknown) => textOf(entry)) : undefined,
    );
    return layers.usesProject
      ? spec.notice(declarations, layers)
      : [ignoredConfigNotice(`the ${spec.label} settings in ${filesOf(relevant)}`, tool)];
  });
}

function pathsOf(declarations: readonly Declaration[]): string[] {
  return declarations.flatMap((declaration) =>
    declaration.path === undefined ? [] : [declaration.path],
  );
}

export function declaredConfigFiles(
  tool: string,
  { root, files }: { root: string; files: readonly string[] },
): { declarations: Map<string, string>; files: string[] } {
  const declarations = toolOf(tool).declarations(
    readDeclaredBuild({ paths: () => [...files], readMany: directorySource(root).readMany }),
  );
  const byFile = Object.groupBy(declarations, (declaration) => declaration.file);
  return {
    declarations: new Map(
      Object.entries(byFile).map(([file, found]) => [
        file,
        JSON.stringify((found ?? []).map(({ setting, value, path }) => ({ setting, value, path }))),
      ]),
    ),
    files: pathsOf(declarations),
  };
}
