import { readInside } from '../../../../shared/conventions/read-inside.mjs';
import { fieldOf, optionalText, textOf, textsOf } from '../../../../shared/values/readers.mts';

import type { ConventionSource } from '../../../../core/conventions/typed/convention-types.mts';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { detektConfigOf, resolveKotlinTools } from '../../adapters/kotlin/kotlin-tools.mts';
import { projectEditorconfig } from '../../adapters/kotlin/style/kotlin-style-files.mts';
import {
  declaredKtfmtStyle,
  detectFormatter,
  isMavenFacts,
  kotlinFilesFromSource,
  kotlinFilesOf,
  KTFMT_STYLE_INDENTATION,
} from '../../adapters/kotlin/style/kotlin-build-text.mts';
import { kotlinSummary } from '../../adapters/kotlin/style/kotlin-format-advice.mts';

export type ToolRequest = {
  readonly formatter: string | undefined;
  readonly detektConfig: string | undefined;
  readonly snapshot: string;
  readonly conventions: unknown;
  readonly policyRoot: string;
  readonly toolPrecedence: Record<string, string[] | undefined>;
  readonly facts: unknown;
};

export function editorconfigOf(root: string): string | undefined {
  return optionalText(callUntyped(projectEditorconfig, root));
}

export function detektConfigFile(
  root: string,
  configured: string | undefined,
  snapshot: string,
): string | undefined {
  return optionalText(callUntyped(detektConfigOf, root, configured, snapshot));
}

export function readInsideRoot(root: string, file: string): string | undefined {
  return optionalText(callUntyped(readInside, root, file, 'utf8'));
}

export function kotlinToolsOf(projectRoot: string, request: ToolRequest): unknown {
  return callUntyped(resolveKotlinTools, projectRoot, request);
}

export function kotlinSummaryOf(tools: unknown, conventions: unknown): string[] {
  return textsOf(callUntyped(kotlinSummary, tools, conventions));
}

export function ktfmtIndentation(style: string | undefined): string | undefined {
  return optionalText(fieldOf(KTFMT_STYLE_INDENTATION, style ?? ''));
}

export function isMaven(facts: unknown): boolean {
  return callUntyped(isMavenFacts, facts) === true;
}

export function mavenFormatter(facts: unknown): string | undefined {
  return optionalText(fieldOf(facts, 'formatter'));
}

export function mavenKtfmtStyle(facts: unknown): string | undefined {
  return optionalText(fieldOf(facts, 'ktfmtStyle'));
}

export function filesOfProject(projectRoot: string): unknown {
  return callUntyped(kotlinFilesOf, projectRoot);
}

export function filesOfSource(source: ConventionSource | undefined, projectRoot: string): unknown {
  return source === undefined
    ? filesOfProject(projectRoot)
    : callUntyped(kotlinFilesFromSource, source);
}

export function declaredStyleOf(facts: unknown): string | undefined {
  return optionalText(callUntyped(declaredKtfmtStyle, facts));
}

export function detectedFormatter(facts: unknown): string {
  return textOf(callUntyped(detectFormatter, facts));
}
