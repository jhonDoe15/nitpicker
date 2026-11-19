import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runMaven } from '../maven-command.mts';
import type { JavaSpawn } from '../../adapters/typed/java-values.mts';
import { MAVEN_PLUGINS } from '../maven-tools.mts';

export function readEffectivePom({
  projectRoot,
  maven,
  work,
  spawn,
  timeoutMs,
}: {
  readonly projectRoot: string;
  readonly maven?: string | undefined;
  readonly work: string;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
}): string {
  const output = path.join(work, 'effective-pom.xml');
  runMaven({
    projectRoot,
    maven,
    spawn,
    timeoutMs,
    args: ['--quiet', `${MAVEN_PLUGINS.help}:effective-pom`, `-Doutput=${output}`],
  });
  return readFileSync(output, 'utf8');
}
