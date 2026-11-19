import { readFileSync } from 'node:fs';
import path from 'node:path';

export const fixture = (name: string): string =>
  readFileSync(path.resolve(import.meta.dirname, '../fixtures', name), 'utf8');

// Stands in for the Java glue: `demo.service.Foo$Inner` -> src/main/java/demo/service/Foo.java
// (test classes live under src/test/java).
export const resolveJavaPath = (className: string, fileName: string | undefined): string => {
  const parts = className.split('.');
  const simple = (parts.pop() ?? '').split('$')[0] ?? '';
  const root = simple.endsWith('Test') ? 'src/test/java' : 'src/main/java';
  return [root, ...parts, fileName ?? `${simple}.java`].join('/');
};
// Stands in for the Java glue: demo.Calc + Calc.java -> src/main/java/demo/Calc.java, and nothing for
// classes without a source file in the project (generated code).
export const resolveMainPath = (className: string, sourceFile: string): string | undefined =>
  className === 'demo.Generated'
    ? undefined
    : `src/main/java/${className.split('.').slice(0, -1).join('/')}/${sourceFile}`;
