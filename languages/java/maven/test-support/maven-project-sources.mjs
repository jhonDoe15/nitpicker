import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readReactor } from '../maven-project.mjs';

export function raw(artifactId, parent = '') {
  const owner =
    parent === '' ? '<groupId>demo</groupId>' : `<parent><groupId>${parent}</groupId></parent>`;
  return `<project>${owner}<artifactId>${artifactId}</artifactId></project>`;
}

export function plugin(artifactId, body, groupId = 'org.apache.maven.plugins') {
  return `<plugin><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>${body}</plugin>`;
}

export function inBuild(plugins) {
  return `<build><plugins>${plugins}</plugins></build>`;
}

export function reactorKit() {
  const roots = [];

  function reactor(files) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reactor-'));
    roots.push(root);
    for (const [name, text] of Object.entries(files)) {
      const file = path.resolve(root, name);
      if (!file.startsWith(root + path.sep)) {
        throw new Error(`Reactor file ${name} is outside the reactor.`);
      }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return root;
  }

  function soloModule(inner) {
    const root = reactor({ 'pom.xml': raw('solo') });
    const [module] = readReactor(
      root,
      `<project><groupId>demo</groupId><artifactId>solo</artifactId>${inner}</project>`,
    );
    return module;
  }

  function removeReactors() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { reactor, soloModule, removeReactors };
}
