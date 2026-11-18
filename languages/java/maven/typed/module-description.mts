import { type ReactorModule, readReactor } from '../maven-project.mts';

export type ModuleDescription = ReactorModule;

export const reactorModules: (projectRoot: string, effectivePom: string) => ModuleDescription[] =
  readReactor;
