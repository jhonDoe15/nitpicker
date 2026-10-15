import { expect } from 'vitest';
export function expectedOutput18_17({ sourceRoot }) {
  return {
    source: `${sourceRoot}/shared/hub.ts`,
    package: 'shared',
    fanIn: 3,
    fanOut: 1,
    totalCoupling: 4,
    instability: 0.25,
    runtimeFanIn: 3,
    runtimeFanOut: 1,
    runtimeInstability: 0.25,
  };
}

export function expectedOutput19_19() {
  return {
    name: 'alpha',
    modules: 2,
    fanIn: 0,
    fanOut: 1,
    instability: 1,
    cohesion: {
      internalEdges: 0,
      edgeDensity: 0,
      connectedComponents: 2,
      largestComponentShare: 0.5,
    },
  };
}

export function expectedOutput20_28() {
  return { internalEdges: 0, edgeDensity: 0, connectedComponents: 2, largestComponentShare: 0.5 };
}

export function expectedOutput21_20() {
  return {
    name: 'shared',
    modules: 2,
    fanIn: 3,
    fanOut: 0,
    instability: 0,
    cohesion: {
      internalEdges: 1,
      edgeDensity: 0.5,
      connectedComponents: 1,
      largestComponentShare: 1,
    },
  };
}

export function expectedOutput22_29() {
  return { internalEdges: 1, edgeDensity: 0.5, connectedComponents: 1, largestComponentShare: 1 };
}

export function expectedOutput32_28() {
  return {
    modules: 2,
    dependencies: 1,
    runtimeDependencies: 1,
    typeOnlyDependencies: 0,
    packages: 1,
  };
}

export function expectedOutput33_41() {
  return { internalEdges: 1, edgeDensity: 0.5, connectedComponents: 1, largestComponentShare: 1 };
}
