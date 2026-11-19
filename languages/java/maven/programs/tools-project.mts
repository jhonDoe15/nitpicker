import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const POM = 'pom.xml';

export function toolPath(directory: string, ...parts: readonly string[]): string {
  const base = path.resolve(directory);
  const full = path.resolve(base, ...parts);
  if (!full.startsWith(base + path.sep)) {
    throw new Error(`${full} is outside ${base}`);
  }
  return full;
}

function pom(artifactId: string, body: string): string {
  return [
    '<project xmlns="http://maven.apache.org/POM/4.0.0">',
    '<modelVersion>4.0.0</modelVersion>',
    `<groupId>nitpicker.tools</groupId><artifactId>${artifactId}</artifactId><version>1</version>`,
    '<packaging>pom</packaging>',
    body,
    '</project>',
    '',
  ].join('\n');
}

export function writeToolsProject(
  directory: string,
  tools: Readonly<Record<string, readonly string[]>>,
): void {
  for (const [name, dependencies] of Object.entries(tools)) {
    mkdirSync(toolPath(directory, name), { recursive: true });
    writeFileSync(
      toolPath(directory, name, POM),
      pom(name, `<dependencies>${dependencies.join('')}</dependencies>`),
    );
  }
  const modules = Object.keys(tools)
    .map((name) => `<module>${name}</module>`)
    .join('');
  writeFileSync(path.join(directory, POM), pom('tools', `<modules>${modules}</modules>`));
}
