import { listNames } from '../../shared/messages/messages.mjs';
import { fieldOf, textOf } from '../../shared/values/readers.mts';

type PackageManager = { readonly run: string; readonly install: string; readonly add: string };

export type Project = {
  readonly family: string;
  readonly preset: string;
  readonly summary: string;
  readonly notes: readonly string[];
  readonly packageManager?: PackageManager;
};

export type Peers = {
  readonly missing: readonly string[];
  readonly uninstalled: readonly string[];
  readonly installedOnly: readonly string[];
  readonly command?: string;
  readonly advice?: string;
  readonly requirements?: string;
};

export type PlacedFile = {
  readonly status: string;
  readonly relative: string;
  readonly reason?: string;
  readonly diff?: string;
  readonly notes?: readonly string[];
};

export type AgentsResult = { readonly status: string; readonly relative: string };

export type Placed = {
  readonly project: Project;
  readonly peers: Peers;
  readonly config: PlacedFile;
  readonly workflow: PlacedFile | undefined;
  readonly approval: PlacedFile | undefined;
  readonly workflowFile: string;
  readonly agents: AgentsResult | undefined;
  readonly offers: { readonly agents: boolean; readonly workflow: boolean };
  readonly skillSource: string;
};

type CiContext = {
  readonly approval: PlacedFile | undefined;
  readonly workflowFile: string;
  readonly command: string;
  readonly offered: boolean;
};

function namesOf(names: readonly string[]): string {
  return textOf(listNames(names));
}

function runCommandOf(project: Project): string {
  return project.family === 'node' && project.packageManager !== undefined
    ? project.packageManager.run
    : 'npx nitpicker';
}

function skillsOf(project: Project): string[] {
  const names = [`nitpicker-${project.preset}`];
  return project.preset === 'kotlin' && fieldOf(project, 'javaSources') === true
    ? [...names, 'nitpicker-java']
    : names;
}

function headline(project: Project): string {
  return `nitpicker init: ${project.summary} (preset "${project.preset}")`;
}

function fileLines(result: PlacedFile): string[] {
  if (result.status === 'created') {
    return [`created ${result.relative}`];
  }
  if (result.status === 'unchanged') {
    return [`${result.relative} is already set up`];
  }
  return [
    `${result.relative} exists and was not changed. ${textOf(result.reason)} The diff from your file to what init would write:`,
    '',
    textOf(result.diff).trimEnd(),
    '',
    `Apply the change by hand, or move ${result.relative} aside and run nitpicker init again.`,
  ];
}

function uninstalledSentence(names: readonly string[]): string {
  return `${namesOf(names)} ${names.length > 1 ? 'are' : 'is'} in package.json but not installed`;
}

function installHeading({ missing, uninstalled }: Peers): string {
  if (missing.length === 0) {
    return `${uninstalledSentence(uninstalled)}. Install ${uninstalled.length > 1 ? 'them' : 'it'}:`;
  }
  const declared =
    uninstalled.length === 0
      ? ''
      : `; ${uninstalledSentence(uninstalled)}, which this installs too`;
  return `Install what nitpicker needs from your project (missing: ${missing.join(', ')}${declared}):`;
}

function installLines(peers: Peers): string[] {
  if (peers.missing.length === 0 && peers.uninstalled.length === 0) {
    return ['Nothing to install: every peer nitpicker needs is already there.'];
  }
  return [
    installHeading(peers),
    `  ${textOf(peers.command)}`,
    ...(peers.advice === undefined ? [] : [peers.advice]),
  ];
}

function peerLines(peers: Peers): string[] {
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

function skillLines(project: Project, source: string): string[] {
  return [
    'Install the agent skill:',
    ...skillsOf(project).map((skill) => `  npx skills add ${source} --skill ${skill}`),
  ];
}

function agentsLines(
  agents: AgentsResult | undefined,
  command: string,
  offered: boolean,
): string[] {
  if (agents === undefined) {
    return offered
      ? [`To add the agent guidance to AGENTS.md, run: ${command} init --agents-md`]
      : [];
  }
  const outcomes: Readonly<Record<string, string>> = {
    created: `created ${agents.relative} with the nitpicker section`,
    appended: `appended the nitpicker section to ${agents.relative}`,
    unchanged: `${agents.relative} already has the nitpicker section`,
  };
  return [outcomes[agents.status] ?? ''];
}

function approvalNote(approval: PlacedFile): string[] {
  return approval.status === 'created'
    ? [
        'A person accepts a policy loosening with the accept-policy-change label; create it once: gh label create accept-policy-change',
      ]
    : [];
}

function ciLines(
  workflow: PlacedFile | undefined,
  { approval, workflowFile, command, offered }: CiContext,
): string[] {
  if (workflow === undefined) {
    return offered ? [`To write ${workflowFile}, run: ${command} init --ci github`] : [];
  }
  return [
    ...fileLines(workflow),
    ...(workflow.notes ?? []),
    ...(approval === undefined ? [] : [...fileLines(approval), ...approvalNote(approval)]),
  ];
}

export function renderReport(placed: Placed): string {
  const { project, peers, config, workflow, approval, workflowFile, agents, offers, skillSource } =
    placed;
  const command = runCommandOf(project);
  const sections = [
    [headline(project), ...project.notes],
    peerLines(peers),
    fileLines(config),
    skillLines(project, skillSource),
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
