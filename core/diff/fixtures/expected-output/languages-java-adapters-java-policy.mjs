import { expect } from 'vitest';
export function expectedOutput65_27() {
  return {
    crapLimit: 12,
    fileLimits: undefined,
    exclude: ['a/**', 'b/*.java'],
    exceptions: [],
    legacyInventory: 'legacy.json',
    policyRoot: '/tmp',
    baselineRoot: '/tmp',
    snapshot: 'head',
    preset: undefined,
    kotlinFormatter: undefined,
    kotlinDetektConfig: undefined,
  };
}

export function expectedOutput132_24() {
  return [
    'archunit',
    'checkstyle',
    'coupling',
    'crap',
    'duplicates',
    'google-java-format',
    'jacoco',
    'pit',
    'pmd',
    'spotbugs',
    'spring',
    'structure',
  ];
}
