import {
  type CiContext,
  type PlacedFile,
  agentsLines,
  ciLines,
  fileLines,
  peerLines,
  skillsOf,
} from '../init-report.mts';
import type { MonorepoLayout } from './monorepo-layout.mts';
import type { MemberSetup } from './monorepo-files.mts';

export type MonorepoPlaced = {
  readonly layout: MonorepoLayout;
  readonly setups: readonly MemberSetup[];
  readonly rootConfig: PlacedFile | undefined;
  readonly workflow: PlacedFile | undefined;
  readonly agents: { readonly status: string; readonly relative: string } | undefined;
  readonly ci: Omit<CiContext, 'command'>;
  readonly offers: { readonly agents: boolean };
  readonly skillSource: string;
};

const COMMAND = 'npx nitpicker';
const SOURCES: Readonly<Record<string, string>> = {
  declared: 'listed in "projects" of nitpicker.config.json',
  detected: 'found from the workspace or build declaration',
  suggested: 'found from their project files',
};

function indented(lines: readonly string[]): string[] {
  return lines.map((line) => (line === '' ? line : `  ${line}`));
}

function memberLines({ member, project, peers, config, error }: MemberSetup): string[] {
  if (project === undefined) {
    return [`${member.path}: not set up. ${String(error)}`];
  }
  const configLines =
    config === undefined
      ? [`No config of its own needed: the monorepo run gives it the "${member.preset}" preset.`]
      : fileLines(config);
  return [
    `${member.path}: ${project.summary} (preset "${project.preset}")`,
    ...indented([
      ...project.notes,
      ...(peers === undefined ? [] : peerLines(peers)),
      ...configLines,
    ]),
  ];
}

function rootLines({ layout, rootConfig }: MonorepoPlaced): string[] {
  if (rootConfig !== undefined) {
    return fileLines(rootConfig);
  }
  return layout.source === 'declared'
    ? ['nitpicker.config.json already lists the projects.']
    : [
        `The projects are ${SOURCES[layout.source] ?? layout.source}, so the top config needs no "projects" list.`,
      ];
}

function skillLines({ setups, skillSource }: MonorepoPlaced): string[] {
  const skills = [
    ...new Set(setups.flatMap(({ project }) => (project === undefined ? [] : skillsOf(project)))),
  ];
  return [
    'Install the agent skills:',
    ...skills.map((skill) => `  npx skills add ${skillSource} --skill ${skill}`),
  ];
}

function sharedOffer(setups: readonly MemberSetup[]): string[] {
  return setups.length < 2
    ? []
    : [
        'Settings that several projects share can live in one file, such as nitpicker.shared.json, that each project config names with "extends": "../nitpicker.shared.json".',
      ];
}

export function renderMonorepoReport(placed: MonorepoPlaced): string {
  const { layout, setups, workflow, agents, ci, offers } = placed;
  const sections = [
    [
      `nitpicker init: a monorepo of ${String(setups.length)} projects, ${SOURCES[layout.source] ?? layout.source}`,
    ],
    ...setups.map(memberLines),
    rootLines(placed),
    skillLines(placed),
    sharedOffer(setups),
    [
      ...agentsLines(agents, { command: COMMAND, offered: offers.agents }),
      ...ciLines(workflow, { ...ci, command: COMMAND }),
    ],
    [
      `Then run \`${COMMAND}\` here to check a change in every project it touches, or \`${COMMAND} --all\` to survey them all.`,
    ],
  ];
  const shown = sections.filter((lines) => lines.length > 0);
  return `${shown.map((lines) => lines.join('\n')).join('\n\n')}\n`;
}
