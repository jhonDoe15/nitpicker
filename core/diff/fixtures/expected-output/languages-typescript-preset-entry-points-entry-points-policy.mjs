import { expect } from 'vitest';
export function expectedOutput31_28() {
  return {
    productionModules: 7,
    components: 3,
    declaredEntryPoints: 1,
    throughEntryPoint: 0,
    publicAlternativeBypasses: 3,
    unexportedTargetImports: 1,
    missingEntryPointImports: 1,
    concreteCrossBoundaryImports: 1,
  };
}

export function expectedOutput37_75() {
  return [
    expect.stringMatching(/beta\/beta-client\.ts$/),
    expect.stringMatching(/beta\/public\.ts$/),
  ];
}

export function expectedOutput43_46({ sourceRoot }) {
  return [
    {
      source: `${sourceRoot}/alpha/consumer.ts`,
      target: `${sourceRoot}/beta/beta-client.ts`,
      sourceComponent: 'alpha',
      targetComponent: 'beta',
      dependencyKind: 'runtime',
      publicEntryPoint: `${sourceRoot}/beta/index.ts`,
    },
    {
      source: `${sourceRoot}/alpha/consumer.ts`,
      target: `${sourceRoot}/beta/public.ts`,
      sourceComponent: 'alpha',
      targetComponent: 'beta',
      dependencyKind: 'runtime',
      publicEntryPoint: `${sourceRoot}/beta/index.ts`,
    },
    {
      source: expect.stringMatching(/root-plugin\.ts$/),
      target: expect.stringMatching(/beta\/public\.ts$/),
      sourceComponent: '(root)',
      targetComponent: 'beta',
      dependencyKind: 'runtime',
      publicEntryPoint: `${sourceRoot}/beta/index.ts`,
    },
  ];
}
