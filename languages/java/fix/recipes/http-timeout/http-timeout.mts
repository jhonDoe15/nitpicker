import type { FixRecipe, RecipeFix } from '../../../../../core/fix/typed/fix-types.mts';
import { exceptedOf, GENERATED } from '../logic/tree-fix-recipe.mts';
import { sourceOf, type Source, type SpanEdit } from '../source/java-source.mts';
import { lineOf, splitTopLevel } from '../source/java-text.mts';
import { callsOf, type Call, type Found } from './http-calls.mts';
import { connectionFixes } from './http-connections.mts';

const SECONDS = '10';
const DURATION = `java.time.Duration.ofSeconds(${SECONDS})`;
const SECOND_UNIT = `${SECONDS}, java.util.concurrent.TimeUnit.SECONDS`;
const READ_TIMEOUT = `.readTimeout(${SECOND_UNIT})`;
const CONNECT_TIMEOUT = `.connectTimeout(${SECOND_UNIT})`;
const RULE = 'HttpWithoutTimeout';
const NEW_BUILDER = 'newBuilder';
const BUILD = 'build';
const JAVA_FILE = /\.java$/u;
const NOT_MAIN_SOURCE_SET = /(?:^|\/)src\/(?!main\/)[^/]+\//u;
const HTTP_REQUEST = { simple: 'HttpRequest', fqn: 'java.net.http.HttpRequest' };
const HTTP_CLIENT = { simple: 'HttpClient', fqn: 'java.net.http.HttpClient' };
const CLIENT_BUILDER = { simple: 'ClientBuilder', fqn: 'jakarta.ws.rs.client.ClientBuilder' };
const APACHE_CLIENT = new RegExp(
  [
    /(?<![\w.$])(?:HttpClients|HttpAsyncClients)\s*\.\s*(?:create\w*|custom)/u,
    /HttpClientBuilder\s*\.\s*create/u,
  ]
    .map(({ source }) => `(?:${source})`)
    .join('|') + String.raw`\s*\(`,
  'gu',
);

function emptyArguments(source: Source, call: Call): boolean {
  return source.code.slice(call.open + 1, call.close).trim() === '';
}

function insertion(call: Call, text: string): SpanEdit {
  return { start: call.close + 1, end: call.close + 1, text };
}

function replacement(call: Call, text: string): SpanEdit {
  return { start: call.start, end: call.close + 1, text };
}

function plainChain(call: Call, configured: readonly string[]): boolean {
  return call.chain.at(-1) === BUILD && !call.chain.some((name) => configured.includes(name));
}

function found(call: Call, edit: SpanEdit): Found {
  return { at: call.start, edits: [edit] };
}

function requestFixes(source: Source): Found[] {
  return callsOf(source, HTTP_REQUEST, NEW_BUILDER)
    .filter((call) => plainChain(call, ['timeout']))
    .filter((call) => splitTopLevel(source.code.slice(call.open + 1, call.close)).length <= 1)
    .map((call) => found(call, insertion(call, `.timeout(${DURATION})`)));
}

function clientFixes(source: Source): Found[] {
  const builders = callsOf(source, HTTP_CLIENT, NEW_BUILDER)
    .filter((call) => emptyArguments(source, call) && plainChain(call, ['connectTimeout']))
    .map((call) => found(call, insertion(call, `.connectTimeout(${DURATION})`)));
  const shared = callsOf(source, HTTP_CLIENT, 'newHttpClient')
    .filter((call) => emptyArguments(source, call))
    .map((call) =>
      found(
        call,
        replacement(call, `HttpClient.newBuilder().connectTimeout(${DURATION}).${BUILD}()`),
      ),
    );
  return [...builders, ...shared];
}

function jaxRsFixes(source: Source): Found[] {
  const builders = callsOf(source, CLIENT_BUILDER, NEW_BUILDER)
    .filter((call) => emptyArguments(source, call))
    .filter((call) => plainChain(call, ['readTimeout', 'property', 'withConfig']))
    .map((call) =>
      found(
        call,
        insertion(
          call,
          call.chain.includes('connectTimeout') ? READ_TIMEOUT : CONNECT_TIMEOUT + READ_TIMEOUT,
        ),
      ),
    );
  const fresh = callsOf(source, CLIENT_BUILDER, 'newClient')
    .filter((call) => emptyArguments(source, call) && call.returned && call.chain.length === 0)
    .map((call) =>
      found(
        call,
        replacement(
          call,
          `ClientBuilder.${NEW_BUILDER}()${CONNECT_TIMEOUT}${READ_TIMEOUT}.${BUILD}()`,
        ),
      ),
    );
  return [...builders, ...fresh];
}

function noteAt(source: Source, at: number, reason: string): string {
  return `pmd/${RULE} in ${source.path}:${String(lineOf(source.text, at))}: left as is, ${reason}`;
}

function apacheNotes(source: Source): string[] {
  const reason =
    'an Apache client takes its deadline from a RequestConfig that this fix does not pick';
  return /org\.apache\.(?:http|hc)\./u.test(source.code)
    ? [...source.code.matchAll(APACHE_CLIENT)].map(({ index }) => noteAt(source, index, reason))
    : [];
}

function assignedNotes(source: Source): string[] {
  const reason = 'the builder is kept in a variable that this fix does not follow';
  return [HTTP_REQUEST, HTTP_CLIENT, CLIENT_BUILDER]
    .flatMap((owner) =>
      callsOf(source, owner, NEW_BUILDER).filter(
        (call) => call.assigned && call.chain.at(-1) !== BUILD,
      ),
    )
    .map((call) => noteAt(source, call.start, reason));
}

function planSource(source: Source): { readonly fixes: RecipeFix[]; readonly notes: string[] } {
  const all = [
    ...requestFixes(source),
    ...clientFixes(source),
    ...jaxRsFixes(source),
    ...connectionFixes(source),
  ];
  const fixes = all.map(({ edits, at }) => ({
    finding: { tool: 'pmd', rule: RULE, path: source.path, line: lineOf(source.text, at) },
    edits: edits.map((edit) => ({ type: 'replace', path: source.path, ...edit }) as const),
  }));
  return { fixes, notes: [...assignedNotes(source), ...apacheNotes(source)] };
}

export const httpWithoutTimeoutRecipe: FixRecipe = {
  id: 'java-http-without-timeout',
  rules: [{ tool: 'pmd', rule: RULE }],
  presets: ['java'],
  scope: 'file',
  safety: 'review',
  plan({ files, inputs }) {
    const isExcepted = exceptedOf(inputs);
    const planned = files
      .filter(
        ({ path: name }) =>
          JAVA_FILE.test(name) &&
          !NOT_MAIN_SOURCE_SET.test(name) &&
          !GENERATED.test(name) &&
          !isExcepted(`pmd/${RULE}`, name),
      )
      .map(({ path: name, text }) => planSource(sourceOf(name, text)));
    return {
      fixes: planned.flatMap(({ fixes }) => fixes),
      notes: planned.flatMap(({ notes }) => notes),
    };
  },
};
