import type { MutantsEntry, RecordedCall } from './fake-call.mts';

type PyrightItem = { readonly file: string } & Readonly<Record<string, unknown>>;
export type PyrightReport = { readonly generalDiagnostics?: readonly PyrightItem[] };

export const parseCall: (text: string) => RecordedCall = JSON.parse;
export const parseFailures: (text: string) => Readonly<Record<string, string>> = JSON.parse;
export const parseMutants: (text: string) => Readonly<Record<string, MutantsEntry>> = JSON.parse;
export const parsePyright: (text: string) => PyrightReport = JSON.parse;
export const parseFacts: (text: string) => { readonly facts?: unknown } = JSON.parse;
