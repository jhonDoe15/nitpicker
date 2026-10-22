import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { javaCommand } from '../maven-command.mjs';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { layerCheckstyle } from '../../adapters/tool-config/checkstyle/checkstyle-layers.mjs';
import { unformattedCheckstyle } from '../../adapters/tool-config/checkstyle/unformatted-checks.mjs';
import { nitpickerCheckstyleConfig, withGuardChecks } from '../../builds/rulesets/checkstyle-config.mjs';

const LAYOUT_SUPPRESSIONS = 'checkstyle-suppressions.xml';
const UNFORMATTED_SUPPRESSIONS = 'checkstyle-suppressions-unformatted.xml';

function bundledGoogleChecks(checkstyleJar) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-'));
  try {
    const result = spawnSync(javaCommand('jar'), ['xf', checkstyleJar, 'google_checks.xml'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const file = path.join(directory, 'google_checks.xml');
    if (result.status !== 0 || !existsSync(file)) {
      throw new Error(`could not read google_checks.xml from ${checkstyleJar}: ${result.stderr}`);
    }
    return readFileSync(file, 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function propertiesLine(name, value) {
  return `${name}=${value.replaceAll('\\', '\\\\')}`;
}

export function checkstyleSetup({ reportDir, tools, configs, pinned, style, test = false }) {
  const jar = tools.checkstyle.find(
    (entry) => path.basename(entry) === `checkstyle-${pinned.checkstyle}.jar`,
  );
  const bundled = nitpickerCheckstyleConfig(bundledGoogleChecks(jar));
  const unformatted = style?.javaStyle === 'none';
  return writeCheckstyleSetup({
    directory: path.join(reportDir, test ? 'checkstyle-test-config' : 'checkstyle-config'),
    nitpickerConfig: withGuardChecks(
      unformatted ? unformattedCheckstyle(bundled, style.indentation) : bundled,
      ['checkstyle-all.xml', ...(test ? [] : ['checkstyle-main.xml'])],
    ),
    suppressions: unformatted ? UNFORMATTED_SUPPRESSIONS : LAYOUT_SUPPRESSIONS,
    ...configs.checkstyle,
  });
}

export function writeCheckstyleSetup({
  directory,
  nitpickerConfig,
  project,
  projectWins,
  suppressions = LAYOUT_SUPPRESSIONS,
}) {
  mkdirSync(directory, { recursive: true });
  const config = path.join(directory, 'checkstyle.xml');
  writeFileSync(
    config,
    project === undefined
      ? nitpickerConfig
      : layerCheckstyle({
          nitpickerText: nitpickerConfig,
          projectText: readFileSync(project, 'utf8'),
          projectWins,
        }),
  );
  const properties = path.join(directory, 'checkstyle.properties');
  writeFileSync(
    properties,
    [
      ...(project === undefined ? [] : [propertiesLine('config_loc', path.dirname(project))]),
      propertiesLine(
        'org.checkstyle.google.suppressionfilter.config',
        path.join(GRADLE_DIRECTORY, suppressions),
      ),
    ].join('\n'),
  );
  return { config, properties };
}
