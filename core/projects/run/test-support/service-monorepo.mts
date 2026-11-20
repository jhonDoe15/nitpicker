import { projectFiles } from './monorepo-harness.mts';

export function serviceMonorepoFiles(
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> {
  return {
    'nitpicker.config.json': JSON.stringify({ projects: ['web', 'api', 'tools/app'] }),
    ...projectFiles('web', {
      'package.json': '{"name":"web","version":"1.0.0"}\n',
      'src/a.ts': 'export const a = 1;\n',
    }),
    ...projectFiles('api', {
      'pyproject.toml': '[project]\nname = "api"\nversion = "0.1.0"\n',
      'src/b.py': 'B = 1\n',
    }),
    ...projectFiles('tools/app', { 'pom.xml': '<project/>\n', 'src/App.java': 'class App {}\n' }),
    ...extra,
  };
}
