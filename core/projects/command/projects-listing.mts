import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';

export type ListedProject = {
  readonly path: string;
  readonly preset: string;
  readonly origin: string;
  readonly selected: boolean;
  readonly reason: string;
};

export type Listing = {
  readonly source: string;
  readonly selectedBy: string;
  readonly projects: readonly ListedProject[];
  readonly outside: readonly string[];
};

const MAX_OUTSIDE = 5;

function count(total: number, word: string): string {
  return `${String(total)} ${word}${total === 1 ? '' : 's'}`;
}

function sourceLine(listing: Listing): string {
  const total = count(listing.projects.length, 'project');
  if (listing.source === 'declared') {
    return `${total} listed in "projects" of ${CONFIG_FILE_NAME}`;
  }
  return listing.source === 'detected' ? `${total} detected` : total;
}

function projectLine(project: ListedProject): string {
  const verb = project.selected ? 'run ' : 'skip';
  return `  ${verb} ${project.path} (${project.preset}; ${project.origin}): ${project.reason}`;
}

function outsideLines(outside: readonly string[]): string[] {
  if (outside.length === 0) {
    return [];
  }
  const more =
    outside.length > MAX_OUTSIDE ? ` and ${String(outside.length - MAX_OUTSIDE)} more` : '';
  return [
    `Changed files outside every project, not checked: ${outside.slice(0, MAX_OUTSIDE).join(', ')}${more}`,
  ];
}

export function listingText(listing: Listing): string {
  const selected = listing.projects.filter((project) => project.selected).length;
  const header = `${sourceLine(listing)}, ${String(selected)} selected by ${listing.selectedBy}:`;
  return `${[header, ...listing.projects.map(projectLine), ...outsideLines(listing.outside)].join('\n')}\n`;
}

export function listingJson(listing: Listing): string {
  const include = listing.projects
    .filter((project) => project.selected)
    .map(({ path, preset }) => ({ project: path, preset }));
  return `${JSON.stringify({
    source: listing.source,
    selectedBy: listing.selectedBy,
    matrix: { include },
    projects: listing.projects,
    outsideProjects: listing.outside,
  })}\n`;
}
