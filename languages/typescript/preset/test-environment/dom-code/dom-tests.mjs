import { readFileSync } from 'node:fs';
import path from 'node:path';

const DOM_DIRECTIVE = /@(?:vitest|jest)-environment\s+\S*(?:jsdom|happy-dom)/u;

export function projectText(projectRoot, file) {
  const absolute = path.resolve(projectRoot, file);
  if (!absolute.startsWith(`${projectRoot}${path.sep}`)) {
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

export function hasDomDirective(projectRoot, file) {
  return DOM_DIRECTIVE.test(projectText(projectRoot, file));
}

export function hasDomDirectiveTests(layout, projectRoot) {
  return layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isRunnableTestFile(file))
    .some((file) => hasDomDirective(projectRoot, file));
}
