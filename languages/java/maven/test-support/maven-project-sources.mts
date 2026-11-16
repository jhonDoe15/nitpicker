import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ModuleDescription, reactorModules } from '../typed/module-description.mts';

export function raw(artifactId: string, parent = ''): string {
  const owner =
    parent === '' ? '<groupId>demo</groupId>' : `<parent><groupId>${parent}</groupId></parent>`;
  return `<project>${owner}<artifactId>${artifactId}</artifactId></project>`;
}

export function plugin(
  artifactId: string,
  body: string,
  groupId = 'org.apache.maven.plugins',
): string {
  return `<plugin><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>${body}</plugin>`;
}

export function inBuild(plugins: string): string {
  return `<build><plugins>${plugins}</plugins></build>`;
}

export function reactorKit(): {
  readonly reactor: (files: Readonly<Record<string, string>>) => string;
  readonly soloModule: (inner: string) => ModuleDescription;
  readonly removeReactors: () => void;
} {
  const roots: string[] = [];

  function reactor(files: Readonly<Record<string, string>>): string {
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

  function soloModule(inner: string): ModuleDescription {
    const root = reactor({ 'pom.xml': raw('solo') });
    const [module] = reactorModules(
      root,
      `<project><groupId>demo</groupId><artifactId>solo</artifactId>${inner}</project>`,
    );
    if (module === undefined) {
      throw new Error('The solo reactor has no module');
    }
    return module;
  }

  function removeReactors(): void {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { reactor, soloModule, removeReactors };
}
