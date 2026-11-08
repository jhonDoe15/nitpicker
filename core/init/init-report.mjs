import { listNames } from '../../shared/messages/messages.mjs';

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

function fileLines(result) {
  if (result.status === 'created') {
    return [`created ${result.relative}`];
  }
  if (result.status === 'unchanged') {
    return [`${result.relative} is already set up`];
  }
  return [
    `${result.relative} exists and was not changed. ${result.reason} The diff from your file to what init would write:`,
    '',
    result.diff.trimEnd(),
    '',
    `Apply the change by hand, or move ${result.relative} aside and run nitpicker init again.`,
  ];
}

function uninstalledSentence(names) {
  return `${listNames(names)} ${names.length > 1 ? 'are' : 'is'} in package.json but not installed`;
}

function installHeading({ missing, uninstalled }) {
  if (missing.length === 0) {
    return `${uninstalledSentence(uninstalled)}. Install ${uninstalled.length > 1 ? 'them' : 'it'}:`;
  }
  const declared =
    uninstalled.length === 0
      ? ''
      : `; ${uninstalledSentence(uninstalled)}, which this installs too`;
  return `Install what nitpicker needs from your project (missing: ${missing.join(', ')}${declared}):`;
}

function installLines(peers) {
  if (peers.missing.length === 0 && peers.uninstalled.length === 0) {
    return ['Nothing to install: every peer nitpicker needs is already there.'];
  }
  return [
    installHeading(peers),
    `  ${peers.command}`,
    ...(peers.advice === undefined ? [] : [peers.advice]),
  ];
}

function peerLines(peers) {
  if (peers.requirements !== undefined) {
    return [`Needs ${peers.requirements}`];
  }
  const undeclared =
    peers.installedOnly.length === 0
      ? []
      : [
          `Installed in .venv but not declared: ${peers.installedOnly.join(', ')}. Declare them as development dependencies, so a fresh checkout gets them too; the CI workflow of init installs them itself.`,
        ];
  return [...installLines(peers), ...undeclared];
}

function skillLines(project) {
  return [
    'Install the agent skill:',
    ...skillsOf(project).map((skill) => `  ${SKILLS_ADD} ${skill}`),
  ];
}

function agentsLines(agents, command, offered) {
  if (agents === undefined) {
    return offered
      ? [`To add the agent guidance to AGENTS.md, run: ${command} init --agents-md`]
      : [];
  }
  const outcomes = {
    created: `created ${agents.relative} with the nitpicker section`,
    appended: `appended the nitpicker section to ${agents.relative}`,
    unchanged: `${agents.relative} already has the nitpicker section`,
  };
  return [outcomes[agents.status]];
}

function approvalNote(approval) {
  return approval.status === 'created'
    ? [
        'A person accepts a policy loosening with the accept-policy-change label; create it once: gh label create accept-policy-change',
      ]
    : [];
}

function ciLines(workflow, { approval, workflowFile, command, offered }) {
  if (workflow === undefined) {
    return offered ? [`To write ${workflowFile}, run: ${command} init --ci github`] : [];
  }
  return [
    ...fileLines(workflow),
    ...(workflow.notes ?? []),
    ...(approval === undefined ? [] : [...fileLines(approval), ...approvalNote(approval)]),
  ];
}

export function renderReport(placed) {
  const { project, peers, config, workflow, approval, workflowFile, agents, offers } = placed;
  const command = runCommandOf(project);
  const sections = [
    [headline(project), ...project.notes],
    peerLines(peers),
    fileLines(config),
    skillLines(project),
    [
      ...agentsLines(agents, command, offers.agents),
      ...ciLines(workflow, { approval, workflowFile, command, offered: offers.workflow }),
    ],
    [
      `Then run \`${command}\` to check a change, or \`${command} --all\` to survey the whole project.`,
    ],
  ];
  const shown = sections.filter((lines) => lines.length > 0);
  return `${shown.map((lines) => lines.join('\n')).join('\n\n')}\n`;
}
