import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runMaven } from '../maven-command.mjs';
import { MAVEN_PLUGINS } from '../maven-tools.mjs';

export function readEffectivePom(projectRoot, maven, work) {
  const output = path.join(work, 'effective-pom.xml');
  runMaven({
    projectRoot,
    maven,
    args: ['--quiet', `${MAVEN_PLUGINS.help}:effective-pom`, `-Doutput=${output}`],
  });
  return readFileSync(output, 'utf8');
}
