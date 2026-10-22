import { readFileSync } from 'node:fs';
import path from 'node:path';

const ENVIRONMENT_DIRECTIVE = /@(?:vitest|jest)-environment\s+([\w-]+)\b/u;
const DOM_ENVIRONMENT_NAME = /jsdom|happy-dom/u;

export function projectText(projectRoot, file) {
  const absolute = path.resolve(projectRoot, file);
  if (!absolute.startsWith(`${projectRoot}${path.sep}`)) {
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

export function hasDomDirective(projectRoot, file) {
  const name = ENVIRONMENT_DIRECTIVE.exec(projectText(projectRoot, file))?.[1] ?? '';
  return DOM_ENVIRONMENT_NAME.test(name);
}

export function hasDomDirectiveTests(layout, projectRoot) {
  return layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isRunnableTestFile(file))
    .some((file) => hasDomDirective(projectRoot, file));
}
