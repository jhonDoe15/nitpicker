import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { runTypedChecks } from '../../../adapters/typed-engine/typed-checks.mts';
import { fieldOf, listOf, textsOf } from '../../../../../shared/values/readers.mts';
import { type ProgramRequest, projectProgramInputs } from '../program.mts';
import type { ContextLayout, FileInfo, Reference } from '../typed/context-types.mts';
import { engineFiles, engineProjectConfig } from './project-inputs.mts';
import type { MemberSite, RegistryData, TargetData } from './registry-data.mts';

export type EngineRegistry = {
  readonly registry: RegistryData;
  readonly owned: ReadonlyMap<string, FileInfo>;
};

type Request = ProgramRequest & {
  readonly layout: ProgramRequest['layout'] & ContextLayout;
  readonly react: boolean;
  readonly environment: NodeJS.ProcessEnv;
};

const CHECK = 'unused-api';

function referenceOf(value: unknown): Reference {
  const passes = fieldOf(value, 'passes');
  return {
    kind:
      fieldOf(value, 'kind') === 'call'
        ? 'call'
        : fieldOf(value, 'kind') === 'escape'
          ? 'escape'
          : 'defaults',
    passes:
      passes === null || passes === undefined
        ? undefined
        : {
            all: fieldOf(passes, 'all') === true,
            names: new Set(textsOf(fieldOf(passes, 'names'))),
          },
    role: fieldOf(value, 'role') === 'support' ? 'support' : 'production',
    packageDir:
      typeof fieldOf(value, 'packageDir') === 'string'
        ? String(fieldOf(value, 'packageDir'))
        : undefined,
  };
}

function memberOf(value: unknown): MemberSite {
  return {
    name: String(fieldOf(value, 'name')),
    fileName: String(fieldOf(value, 'fileName')),
    line: Number(fieldOf(value, 'line')),
  };
}

function targetOf(value: unknown, entries: ReadonlyMap<string, FileInfo>): TargetData {
  return {
    name: String(fieldOf(value, 'name')),
    kind: fieldOf(value, 'kind') === 'component' ? 'component' : 'function',
    package: entries.get(String(fieldOf(value, 'fileName')))?.package,
    members: listOf(fieldOf(value, 'members')).map(memberOf),
    refs: listOf(fieldOf(value, 'refs')).map(referenceOf),
  };
}

export function engineRegistry(request: Request): EngineRegistry | undefined {
  const inputs = projectProgramInputs(request);
  const files = engineFiles({ ...request, rootNames: inputs.rootNames });
  const outcome = runTypedChecks({
    project(folder) {
      const configPath = path.join(folder, 'tsconfig.json');
      writeFileSync(configPath, JSON.stringify(engineProjectConfig(inputs, request)));
      return configPath;
    },
    checks: [CHECK],
    inputs: { [CHECK]: { react: request.react, files: files.input } },
    environment: { ...process.env, ...request.environment },
  });
  const result = outcome.checks?.[CHECK];
  if (result === undefined) {
    return undefined;
  }
  return {
    registry: {
      targets: listOf(fieldOf(result, 'targets')).map((target) => targetOf(target, files.entries)),
      cloned: listOf(fieldOf(result, 'cloned')).map(referenceOf),
    },
    owned: files.entries,
  };
}
