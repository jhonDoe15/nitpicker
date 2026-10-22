import { CONFIG_FILE_NAME } from '../../shared/config.mjs';
import { WORKFLOW_PATH } from './files/ci-workflow.mjs';

const SKILLS_ADD = 'npx skills add jhonDoe15/nitpicker --skill';

function runCommandOf(project) {
  return project.family === 'node' ? project.packageManager.run : 'npx nitpicker';
}

function skillsOf(project) {
  const names = [`nitpicker-${project.preset}`];
  return project.preset === 'kotlin' && project.javaSources ? [...names, 'nitpicker-java'] : names;
}

function headline(project) {
  return `nitpicker init: ${project.summary} (preset "${project.preset}")`;
}

function fileLines(result, { preset }) {
  if (result.status === 'created') {
    return [`created ${result.relative}`];
  }
  if (result.status === 'unchanged') {
    return [`${result.relative} is already set up`];
  }
  const reason =
    result.relative === CONFIG_FILE_NAME
      ? `It does not set "preset": "${preset}", which this project needs.`
      : 'It differs from what init would write.';
  return [
    `${result.relative} exists and was not changed. ${reason} The diff from your file to what init would write:`,
    '',
    result.diff.trimEnd(),
    '',
    `Apply the change by hand, or move ${result.relative} aside and run nitpicker init again.`,
  ];
}

function peerLines(peers) {
  if (peers.requirements !== undefined) {
    return [`Needs ${peers.requirements}`];
  }
  if (peers.missing.length === 0) {
    return ['Nothing to install: every peer nitpicker needs is already there.'];
  }
  return [
    `Install what nitpicker needs from your project (missing: ${peers.missing.join(', ')}):`,
    `  ${peers.command}`,
  ];
}

function skillLines(project) {
  return [
    'Teach your coding agent the allowed forms:',
    ...skillsOf(project).map((skill) => `  ${SKILLS_ADD} ${skill}`),
  ];
}

function agentsLines(agents, command) {
  if (agents === undefined) {
    return [`To add the agent guidance to AGENTS.md, run: ${command} init --agents-md`];
  }
  const outcomes = {
    created: `created ${agents.relative} with the nitpicker section`,
    appended: `appended the nitpicker section to ${agents.relative}`,
    unchanged: `${agents.relative} already has the nitpicker section`,
  };
  return [outcomes[agents.status]];
}

function ciLines(workflow, project, command) {
  if (workflow === undefined) {
    return [`To write ${WORKFLOW_PATH}, run: ${command} init --ci github`];
  }
  return fileLines(workflow, project);
}

export function renderReport({ project, peers, config, workflow, agents }) {
  const command = runCommandOf(project);
  const sections = [
    [headline(project), ...fileLines(config, project), ...project.notes],
    peerLines(peers),
    skillLines(project),
    [...agentsLines(agents, command), ...ciLines(workflow, project, command)],
    [
      `Then run \`${command}\` to check a change, or \`${command} --all\` to survey the whole project.`,
    ],
  ];
  return `${sections.map((lines) => lines.join('\n')).join('\n\n')}\n`;
}
