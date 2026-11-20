import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ResolvedLayout } from '../../typed/layout-types.mts';
import { cssInJsSource, defaultResolvedLayout, stylesheetSpecifier } from '../../layout.mts';
import { isReactNativePackage, readDependencyNames } from '../scope-support.mts';
import { defaultStylingApproach } from './react-rules.mts';

type Approach = 'class-names' | 'css-in-js' | 'style-sheet' | 'inline-style';
type StylingLayout = Pick<ResolvedLayout, 'projectCodeFiles' | 'sourceRoots' | 'isSourceFile'>;

const MAX_SCANNED_FILES = 3000;
const importSource = /\b(?:from|import|require)\s*(?:\(\s*)?["']([^"'\n]+)["']/gu;
const classNameAttribute = /\bclassName\s*=/u;
const styleSheetCall = /\bStyleSheet\.create\s*\(/u;
const inlineStyleObject = /\bstyle\s*=\s*\{\s*\{/u;
const approachOrder: readonly Approach[] = [
  'class-names',
  'css-in-js',
  'style-sheet',
  'inline-style',
];

function sourcesOf(text: string): string[] {
  return [...text.matchAll(importSource)].map(([, source]) => source ?? '');
}

function approachesUsedIn(text: string): Approach[] {
  const sources = sourcesOf(text);
  const used: Readonly<Record<Approach, boolean>> = {
    'class-names':
      sources.some((source) => stylesheetSpecifier.test(source)) || classNameAttribute.test(text),
    'css-in-js': sources.some((source) => cssInJsSource.test(source)),
    'style-sheet': styleSheetCall.test(text),
    'inline-style': inlineStyleObject.test(text),
  };
  return approachOrder.filter((approach) => used[approach]);
}

function textOf(projectRoot: string, file: string): string {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, file);
  if (!full.startsWith(base + path.sep)) {
    return '';
  }
  return readFileSync(full, 'utf8');
}

function fileCounts(projectRoot: string, files: readonly string[]): Map<Approach, number> {
  const counts = new Map<Approach, number>(approachOrder.map((approach) => [approach, 0]));
  for (const file of files.slice(0, MAX_SCANNED_FILES)) {
    for (const approach of approachesUsedIn(textOf(projectRoot, file))) {
      counts.set(approach, (counts.get(approach) ?? 0) + 1);
    }
  }
  return counts;
}

function usedStylingApproach(
  projectRoot: string,
  layout: StylingLayout = defaultResolvedLayout,
): Approach | undefined {
  const files = layout
    .projectCodeFiles(projectRoot, layout.sourceRoots)
    .filter((file) => layout.isSourceFile(file));
  const counts = fileCounts(projectRoot, files);
  const most = Math.max(...counts.values());
  return most === 0 ? undefined : approachOrder.find((approach) => counts.get(approach) === most);
}

function dependencyStylingApproach(projectRoot: string): string {
  const dependencies = readDependencyNames(projectRoot);
  if (dependencies.some((name) => cssInJsSource.test(name))) {
    return 'css-in-js';
  }
  return dependencies.some(isReactNativePackage) ? 'style-sheet' : defaultStylingApproach;
}

export function stylingApproachFor({
  projectRoot,
  react = {},
  layout = defaultResolvedLayout,
}: {
  projectRoot: string;
  react?: { readonly styling?: unknown; readonly [field: string]: unknown };
  layout?: StylingLayout | undefined;
}): unknown {
  return (
    react.styling ??
    usedStylingApproach(projectRoot, layout) ??
    dependencyStylingApproach(projectRoot)
  );
}
