import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRADLE_DIRECTORY, INIT_SCRIPT } from '../../builds/java-build.mjs';
import { spotbugsLaunch } from './spotbugs-launch.mjs';

describe('spotbugsLaunch', () => {
  const module = { sourceRoots: ['/missing/src'], outputDirectory: '/work/classes' };
  const launch = spotbugsLaunch({
    module,
    report: '/work/spotbugs.sarif',
    tools: { spotbugsPlugins: ['/m2/plugin.jar', '/m2/extra.jar'] },
    settings: ['-effort:default', '-medium'],
  });

  it('loads find-sec-bugs with its exclusion filter, as the Gradle run does', () => {
    const argument = (name) => launch.args[launch.args.indexOf(name) + 1];

    expect(launch.args.slice(0, 2)).toEqual(['-effort:default', '-medium']);
    expect(argument('-pluginList')).toBe(['/m2/plugin.jar', '/m2/extra.jar'].join(path.delimiter));
    expect(argument('-exclude')).toBe(path.join(GRADLE_DIRECTORY, 'security', 'exclude.xml'));
    expect(launch.args.at(-1)).toBe('/work/classes');
  });

  it('gives the plugin the same sink files and types as the Gradle init script', () => {
    const init = readFileSync(INIT_SCRIPT, 'utf8');
    const gradleFiles = [
      ...init.matchAll(/security\/([\w-]+-sinks\.txt)'\)\.absolutePath\}\|(\w+)/gu),
    ]
      .map(([, file, type]) => `${file}|${type}`)
      .sort();
    const mavenFiles = launch.jvmArgs
      .flatMap((argument) => argument.split('=')[1].split(path.delimiter))
      .map((entry) => `${path.basename(entry.split('|')[0])}|${entry.split('|')[1]}`)
      .sort();

    expect(mavenFiles).toEqual(gradleFiles);
    expect(launch.jvmArgs.map((argument) => argument.split('=')[0])).toEqual([
      '-Dfindsecbugs.injection.customconfigfile.SqlInjectionDetector',
      '-Dfindsecbugs.injection.customconfigfile.PathTraversalDetector',
    ]);
  });
});
