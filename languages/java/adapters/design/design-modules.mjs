import { existsSync } from 'node:fs';
import path from 'node:path';
import { moduleProject } from '../../builds/java-modules.mjs';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';

function hasManifest(moduleDir, reportDirectory) {
  const manifest = resolveInside(moduleDir, `${reportDirectory}/manifest.json`);
  return manifest !== undefined && existsSync(manifest);
}

export function gradleDesignModules(report) {
  return report.modules.map((module) => ({
    dir: module.dir,
    sourceRoots: module.manifest.sourceRoots ?? [],
    published: module.manifest.published === true,
  }));
}

export function mavenDesignModules(projectRoot, moduleDirs, reportDirectory) {
  return moduleDirs.map((moduleDir) => {
    if (!hasManifest(moduleDir, reportDirectory)) {
      const name = path.relative(projectRoot, moduleDir).replaceAll('\\', '/') || '.';
      throw new Error(`The design rules found no manifest.json for the Maven module ${name}`);
    }
    const project = moduleProject(projectRoot, moduleDir, { reportDirectory });
    return {
      dir: project.qualifier,
      sourceRoots: project.sourceRoots,
      published: project.published,
    };
  });
}
