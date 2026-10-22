import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readReactor } from '../maven-project.mjs';

export const IT_GOAL = '<goals><goal>integration-test</goal></goals>';

export function writeReactor(files, roots) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reactor-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    const full = path.resolve(root, name);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`${name} is outside the reactor`);
    }
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

export function raw(artifactId, parent = '') {
  const owner =
    parent === '' ? '<groupId>demo</groupId>' : `<parent><groupId>${parent}</groupId></parent>`;
  return `<project>${owner}<artifactId>${artifactId}</artifactId></project>`;
}

export function readSoloModule(inner, roots) {
  const root = writeReactor({ 'pom.xml': raw('solo') }, roots);
  const [module] = readReactor(
    root,
    `<project><groupId>demo</groupId><artifactId>solo</artifactId>${inner}</project>`,
  );
  return module;
}

export function plugin(artifactId, body, groupId = 'org.apache.maven.plugins') {
  return `<plugin><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>${body}</plugin>`;
}

export function failsafe(executions, configuration = '') {
  return plugin(
    'maven-failsafe-plugin',
    `<configuration>${configuration}</configuration><executions>${executions}</executions>`,
  );
}

export function inBuild(plugins) {
  return `<build><plugins>${plugins}</plugins></build>`;
}
