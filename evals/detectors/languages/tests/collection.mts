import type { Language, ParsedTest, Tree } from '../../common/types.mts';
import { isBuildFile, isCollectedPythonFile } from '../project-files.mts';

export type JunitPlatform = { known: boolean; jupiter: boolean; junit4: boolean };

export function junitPlatformOf(tree: Tree): JunitPlatform {
  const text = [...tree]
    .filter(([file]) => isBuildFile(file))
    .map(([, content]) => content)
    .join('\n');
  const jupiter = /useJUnitPlatform|junit-jupiter|junit\.jupiter/u.test(text);
  const vintage = /junit-vintage|vintage-engine/u.test(text);
  const legacy = /\bjunit:junit\b|<artifactId>junit<\/artifactId>|useJUnit\(\)/u.test(text);
  return {
    known: jupiter || vintage || legacy,
    jupiter: jupiter || !legacy,
    junit4: vintage || (legacy && !jupiter),
  };
}

export function isLive({
  language,
  file,
  test,
  platform,
}: {
  language: Language;
  file: string;
  test: ParsedTest;
  platform: JunitPlatform;
}): boolean {
  if (!test.collected) return false;
  if (language === 'python') return isCollectedPythonFile(file);
  if (!platform.known || test.family === 'other') return true;
  return test.family === 'junit4' ? platform.junit4 : platform.jupiter;
}
