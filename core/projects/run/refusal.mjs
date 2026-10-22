import { realpathSync } from 'node:fs';
import { resolveProjectRoot } from '../../tooling/tool-resolution.mjs';
import { planMonorepo } from './plan.mjs';

function monorepoAt(cli) {
  try {
    const root =
      cli.currentProjectRoot === undefined
        ? resolveProjectRoot()
        : realpathSync(cli.currentProjectRoot);
    return { plan: planMonorepo({ root }) };
  } catch {
    return { plan: undefined };
  }
}

export function monorepoRefusal(cli, command) {
  if (cli.arguments_.includes('--help')) {
    return undefined;
  }
  const { plan } = monorepoAt(cli);
  if (plan === undefined) {
    return undefined;
  }
  const folders = plan.projects.map(({ path }) => path).join(', ');
  cli.stderr.write(
    `nitpicker: "${command}" works on one project, ` +
      `and ${plan.root} holds ${String(plan.projects.length)} (${folders}). ` +
      `Run it inside each project instead: cd <project> && nitpicker ${command} ...\n`,
  );
  return 2;
}
