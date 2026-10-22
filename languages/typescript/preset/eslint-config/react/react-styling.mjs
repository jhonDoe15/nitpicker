import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cssInJsSource, defaultResolvedLayout, stylesheetSpecifier } from '../../layout.mjs';
import { isReactNativePackage, readDependencyNames } from '../scope-support.mjs';
import { defaultStylingApproach } from './react-rules.mjs';

const MAX_SCANNED_FILES = 3000;
const importSource = /\b(?:from|import|require)\s*(?:\(\s*)?["']([^"'\n]+)["']/gu;
const classNameAttribute = /\bclassName\s*=/u;
const styleSheetCall = /\bStyleSheet\.create\s*\(/u;
const inlineStyleObject = /\bstyle\s*=\s*\{\s*\{/u;
const approachOrder = ['class-names', 'css-in-js', 'style-sheet', 'inline-style'];

function sourcesOf(text) {
  return [...text.matchAll(importSource)].map(([, source]) => source);
}

function approachesUsedIn(text) {
  const sources = sourcesOf(text);
  const used = {
    'class-names':
      sources.some((source) => stylesheetSpecifier.test(source)) || classNameAttribute.test(text),
    'css-in-js': sources.some((source) => cssInJsSource.test(source)),
    'style-sheet': styleSheetCall.test(text),
    'inline-style': inlineStyleObject.test(text),
  };
  return approachOrder.filter((approach) => used[approach]);
}

function textOf(projectRoot, file) {
  const base = path.resolve(projectRoot);
  const full = path.resolve(base, file);
  if (!full.startsWith(base + path.sep)) {
    return '';
  }
  return readFileSync(full, 'utf8');
}

function fileCounts(projectRoot, files) {
  const counts = new Map(approachOrder.map((approach) => [approach, 0]));
  for (const file of files.slice(0, MAX_SCANNED_FILES)) {
    for (const approach of approachesUsedIn(textOf(projectRoot, file))) {
      counts.set(approach, counts.get(approach) + 1);
    }
  }
  return counts;
}

function usedStylingApproach(projectRoot, layout = defaultResolvedLayout) {
  const files = layout
    .projectCodeFiles(projectRoot, layout.sourceRoots)
    .filter((file) => layout.isSourceFile(file));
  const counts = fileCounts(projectRoot, files);
  const most = Math.max(...counts.values());
  return most === 0 ? undefined : approachOrder.find((approach) => counts.get(approach) === most);
}

function dependencyStylingApproach(projectRoot) {
  const dependencies = readDependencyNames(projectRoot);
  if (dependencies.some((name) => cssInJsSource.test(name))) {
    return 'css-in-js';
  }
  return dependencies.some(isReactNativePackage) ? 'style-sheet' : defaultStylingApproach;
}

export function stylingApproachFor({ projectRoot, react = {}, layout = defaultResolvedLayout }) {
  return (
    react.styling ??
    usedStylingApproach(projectRoot, layout) ??
    dependencyStylingApproach(projectRoot)
  );
}
