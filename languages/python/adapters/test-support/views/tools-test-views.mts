import { jscpdVersion as untypedJscpdVersion } from '../../../../../core/tooling/jscpd/run-jscpd.mjs';
import { linkSentence as untypedLinkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';
import { probe as untypedProbe } from '../../execution/python-process.mjs';
import { fieldOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';

const jscpdVersionText: () => unknown = untypedJscpdVersion;
const linkSentenceText: (key: string) => unknown = untypedLinkSentence;

export function jscpdVersion(): string {
  return textOf(jscpdVersionText());
}

export function linkSentence(key: string): string {
  return textOf(linkSentenceText(key));
}

export function runsOf(json: string): readonly unknown[] {
  const runs = fieldOf(parseJson(json), 'runs');
  return Array.isArray(runs) ? runs.map((run: unknown) => run) : [];
}

export function testsRanOf(json: string): unknown {
  return fieldOf(parseJson(json), 'testsRan');
}

export function probe(context: unknown, command: readonly string[]): unknown {
  const call: (context: unknown, command: readonly string[]) => unknown = untypedProbe;
  return call(context, command);
}

export function launchEnv(context: Readonly<Record<string, unknown>>, tool: string): unknown {
  const launcher = fieldOf(context, 'launcher');
  const launch = fieldOf(launcher, 'launch');
  if (typeof launch !== 'function') {
    throw new Error('the context has no launcher');
  }
  return fieldOf(Reflect.apply(launch, launcher, [tool, []]), 'env');
}
