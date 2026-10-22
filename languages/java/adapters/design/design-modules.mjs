import path from 'node:path';
import { inModule } from '../../builds/module-path.mjs';
import { readInside } from '../../../../shared/conventions/read-inside.mjs';

export function gradleDesignModules(report) {
  return report.modules.map((module) => ({
    dir: module.dir,
    sourceRoots: module.manifest.sourceRoots ?? [],
    published: module.manifest.published === true,
  }));
}

export function mavenDesignModules(projectRoot, moduleDirs, reportDirectory) {
  return moduleDirs.map((moduleDir) => {
    const prefix = path.relative(projectRoot, moduleDir).replaceAll('\\', '/');
    const text = readInside(moduleDir, `${reportDirectory}/manifest.json`, 'utf8');
    if (text === undefined) {
      throw new Error(`The design rules found no manifest.json for the Maven module ${prefix}`);
    }
    const manifest = JSON.parse(text);
    return {
      dir: prefix,
      sourceRoots: (manifest.sourceRoots ?? []).map((root) => inModule(prefix, root)),
      published: manifest.published === true,
    };
  });
}
