import { existsSync } from 'node:fs';
import path from 'node:path';
import { END_TO_END_ROOT } from '../../layout.mts';
import { readHeadPolicy as untypedReadHeadPolicy } from '../../head-policy.mts';
import { fieldOf, fieldsOf, parseJson, textsOf } from '../../../../../shared/values/readers.mts';
import { hasDomDirectiveTests } from './dom-tests.mts';

type DomContext = {
  readonly projectDirectory: string;
  readonly layout: {
    readonly testRoots: readonly string[];
    projectCodeFiles(projectRoot: string): readonly string[];
    isRunnableTestFile(file: string): boolean;
  };
};

const readHeadPolicy: () => unknown = untypedReadHeadPolicy;

const DOM_LIB = 'dom';
function hasEndToEndRoot(name: string, { projectDirectory, layout }: DomContext): boolean {
  return (
    name === 'tsconfig.quality.json' &&
    layout.testRoots.includes(END_TO_END_ROOT) &&
    existsSync(path.join(projectDirectory, END_TO_END_ROOT))
  );
}

function testsUseDom(name: string, context: DomContext): boolean {
  return (
    hasEndToEndRoot(name, context) ||
    fieldOf(fieldOf(fieldOf(readHeadPolicy(), 'tools'), 'tests'), 'domEnvironment') === true ||
    hasDomDirectiveTests(context.layout, context.projectDirectory)
  );
}

export function libsWithTestDom(
  libs: readonly string[] | undefined,
  name: string,
  context: DomContext,
): string[] | undefined {
  const lacksDom = libs?.every((lib) => lib.toLowerCase() !== DOM_LIB) ?? false;
  return lacksDom && libs !== undefined && testsUseDom(name, context)
    ? [...libs, DOM_LIB]
    : undefined;
}

export function withTestDom(text: string, name: string, context: DomContext): string {
  const config = parseJson(text);
  const options = fieldOf(config, 'compilerOptions');
  const libs = fieldOf(options, 'lib');
  const lib = libsWithTestDom(Array.isArray(libs) ? textsOf(libs) : undefined, name, context);
  if (lib === undefined) {
    return text;
  }
  const compilerOptions = { ...fieldsOf(options), lib };
  return `${JSON.stringify({ ...fieldsOf(config), compilerOptions }, null, 2)}\n`;
}
