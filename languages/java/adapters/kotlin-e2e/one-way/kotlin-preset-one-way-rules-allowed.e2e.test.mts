import { describe } from 'vitest';
import { kotlinE2eEnabled } from '../__tests__/kotlin-e2e-project.mts';
import { defineAllowedCases } from '../__tests__/kotlin-one-way-cases.mts';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rules end to end', () => {
  defineAllowedCases(useKotlinOneWayProject('allowed'));
});
