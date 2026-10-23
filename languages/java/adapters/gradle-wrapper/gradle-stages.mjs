import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { javaStyleProperties } from '../style/java-style.mjs';
import { toolConfigChoices, toolConfigProperties } from '../tool-config/tool-config-choices.mjs';
import { writeSpringRoles } from '../spring-arch/spring-roles.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const CHECKSTYLE_EXPORT = 'checkstyle-nitpicker.xml';

function exportArguments(common, { initScript, directory, policy }) {
  mkdirSync(directory, { recursive: true });
  return [
    ...common,
    ...javaStyleProperties(policy),
    `-Pnitpicker.checkstyle.exportConfig=${path.join(directory, CHECKSTYLE_EXPORT)}`,
    '-I',
    initScript,
    'nitpickerCheckstyleConfig',
  ];
}

export function gradleOptions(target, { projectRoot, budget, spawn }) {
  return {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: target.shell,
    timeout: budget.commandTimeoutMs,
    spawn,
  };
}

function headFactProperties(policy, directory) {
  mkdirSync(directory, { recursive: true });
  const roles = writeSpringRoles(policy.springRoles, directory);
  return [
    ...javaStyleProperties(policy),
    ...(policy.spring === true ? ['-Pnitpicker.spring=true'] : []),
    ...(roles === undefined ? [] : [`-Pnitpicker.spring.roles=${roles}`]),
  ];
}

export function gradleStages(common, { projectRoot, initScript, policy, directory }) {
  const checkstyleBase = path.join(directory, CHECKSTYLE_EXPORT);
  const layersCheckstyle = toolConfigChoices(projectRoot, policy).checkstyle.project !== undefined;
  return [
    ...(layersCheckstyle ? [() => exportArguments(common, { initScript, directory, policy })] : []),
    () => [
      ...common,
      ...toolConfigProperties(projectRoot, policy, { directory, checkstyleBase }),
      ...headFactProperties(policy, directory),
      '-I',
      initScript,
      'nitpickerJava',
    ],
  ];
}
