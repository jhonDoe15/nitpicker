import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readReactor } from '../maven-project.mjs';

const roots = [];

export function removeReactors() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function reactor(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reactor-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

export const raw = (artifactId, parent = '') =>
  `<project>${parent === '' ? '<groupId>demo</groupId>' : `<parent><groupId>${parent}</groupId></parent>`}<artifactId>${artifactId}</artifactId></project>`;

export function soloModule(inner) {
  const root = reactor({ 'pom.xml': raw('solo') });
  const [module] = readReactor(
    root,
    `<project><groupId>demo</groupId><artifactId>solo</artifactId>${inner}</project>`,
  );
  return module;
}

export function plugin(artifactId, body, groupId = 'org.apache.maven.plugins') {
  return `<plugin><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>${body}</plugin>`;
}

export const inBuild = (plugins) => `<build><plugins>${plugins}</plugins></build>`;
