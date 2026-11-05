import { describe } from 'vitest';
import { kotlinE2eEnabled } from '../test-support/kotlin-e2e-project.mjs';
import { defineAllowedCases } from '../__tests__/kotlin-one-way-cases.mjs';
import { useKotlinOneWayProject } from '../__tests__/kotlin-one-way-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset one-way rules end to end', () => {
  defineAllowedCases(useKotlinOneWayProject('allowed'));
});
