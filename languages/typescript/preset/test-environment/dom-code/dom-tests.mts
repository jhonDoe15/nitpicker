import { readFileSync } from 'node:fs';
import path from 'node:path';

const ENVIRONMENT_DIRECTIVE = /@(?:vitest|jest)-environment\s+(\S+)/u;
const DOM_ENVIRONMENT_NAME = /jsdom|happy-dom/u;

type CodeLayout = {
  projectCodeFiles(projectRoot: string): readonly string[];
  isRunnableTestFile(file: string): boolean;
};

export function projectText(projectRoot: string, file: string): string {
  const absolute = path.resolve(projectRoot, file);
  if (!absolute.startsWith(`${projectRoot}${path.sep}`)) {
    return '';
  }
  return readFileSync(absolute, 'utf8');
}

export function hasDomDirective(projectRoot: string, file: string): boolean {
  const name = ENVIRONMENT_DIRECTIVE.exec(projectText(projectRoot, file))?.[1] ?? '';
  return DOM_ENVIRONMENT_NAME.test(name);
}

export function hasDomDirectiveTests(layout: CodeLayout, projectRoot: string): boolean {
  return layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isRunnableTestFile(file))
    .some((file) => hasDomDirective(projectRoot, file));
}
