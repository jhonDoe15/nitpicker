import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mts';
import { startToolHosts } from '../../builds/host/session/host-session.mts';
import { compiledProgram, programSources } from './helper-programs.mts';
import type { HostRequest, ToolHosts } from '../../builds/host/session/host-session.mts';

const HOST_DIRECTORY = path.join(GRADLE_DIRECTORY, 'host');

function hostSources(): string[] {
  return programSources(HOST_DIRECTORY, { recursive: true });
}

export const HOST_PROGRAM: HostRequest['program'] = {
  compile: compiledProgram,
  root: HOST_DIRECTORY,
  sources: hostSources,
};

export function startJavaToolHosts(request: Omit<HostRequest, 'program'>): ToolHosts | undefined {
  return startToolHosts({ ...request, program: HOST_PROGRAM });
}
