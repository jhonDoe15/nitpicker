import { expect } from 'vitest';
export function expectedOutput65_21() {
  return {
    file: 'src/main/java/stable/S.java',
    fanIn: 3,
    fanOut: 2,
    totalCoupling: 5,
    instability: 0.4,
  };
}

export function expectedOutput66_79() {
  return { file: 'src/main/java/Main.java', fanIn: 0, fanOut: 1, totalCoupling: 1, instability: 1 };
}

export function expectedOutput76_41() {
  return {
    name: 'client',
    modules: 3,
    fanIn: 1,
    fanOut: 1,
    instability: 0.5,
    cohesion: {
      internalEdges: 1,
      edgeDensity: 0.1667,
      connectedComponents: 2,
      largestComponentShare: 0.6667,
    },
  };
}

export function expectedOutput83_41() {
  return {
    name: 'stable',
    modules: 1,
    fanIn: 3,
    fanOut: 2,
    instability: 0.4,
    cohesion: {
      internalEdges: 0,
      edgeDensity: null,
      connectedComponents: 1,
      largestComponentShare: 1,
    },
  };
}

export function expectedOutput84_40() {
  return {
    name: 'churn',
    modules: 1,
    fanIn: 1,
    fanOut: 1,
    instability: 0.5,
    cohesion: {
      internalEdges: 0,
      edgeDensity: null,
      connectedComponents: 1,
      largestComponentShare: 1,
    },
  };
}

export function expectedOutput85_39() {
  return {
    name: 'leaf',
    modules: 1,
    fanIn: 2,
    fanOut: 0,
    instability: 0,
    cohesion: {
      internalEdges: 0,
      edgeDensity: null,
      connectedComponents: 1,
      largestComponentShare: 1,
    },
  };
}

export function expectedOutput86_41() {
  return {
    name: '(root)',
    modules: 1,
    fanIn: 0,
    fanOut: 1,
    instability: 1,
    cohesion: {
      internalEdges: 0,
      edgeDensity: null,
      connectedComponents: 1,
      largestComponentShare: 1,
    },
  };
}
