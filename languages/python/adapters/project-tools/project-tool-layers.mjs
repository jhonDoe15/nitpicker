import { createRequire } from 'node:module';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';

export { parseToml } from '../../../../core/tooling/uv-workspace.mjs';

export function stringifyToml(value) {
  return createRequire(import.meta.url)('smol-toml').stringify(value);
}

export function attempt(read) {
  try {
    return { value: read() };
  } catch (error) {
    return { error };
  }
}

export function toolLayers(context, tool) {
  const layers = precedenceLayers(context.toolPrecedence?.[tool]);
  return {
    optedIn: layers.usesProject,
    appliesProject: layers.usesProject && !layers.nitpickerFirst,
    nitpickerFirst: layers.nitpickerFirst,
    configRoot: layers.usesProject
      ? (context.policyRoot ?? context.projectRoot)
      : context.projectRoot,
  };
}

export function requireProjectConfig(found, { tool, looked, configRoot }) {
  if (found === undefined) {
    throw new Error(missingProjectConfig(tool, `${looked} (searched ${configRoot})`));
  }
  if (found.unreadable !== undefined) {
    throw new Error(
      [
        `The ${tool} config ${found.file} could not be parsed (${found.unreadable}):`,
        `fix it, or remove "project" from tools.${tool}.precedence`,
      ].join(' '),
    );
  }
  return found;
}

export function unique(values) {
  return [...new Set(values)];
}
