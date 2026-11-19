import {
  chainedCalls,
  httpWithoutTimeout as untypedHttpWithoutTimeout,
} from '../../../../adapters/kotlin/scan/security/clients.mts';
import type { ChainedCall } from '../../../../adapters/kotlin/scan/security/clients.mts';
import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import { braceDepths } from '../shared/kotlin-scan.mts';
import type { KotlinEdit, KotlinFound, ScannedKotlin } from '../shared/kotlin-scan.mts';

const httpWithoutTimeout: (scanned: ScannedKotlin) => readonly { readonly offset: number }[] =
  untypedHttpWithoutTimeout;

const SECONDS = 10;
const REQUEST_BUILDER = /^HttpRequest\s*\.\s*newBuilder\s*\(/u;
const JAX_RS_BUILDER = /^ClientBuilder\s*\.\s*newBuilder\s*\(/u;
const CONNECTION_CAST = /\.\s*openConnection\s*\(\s*\)\s+as\s+(?:java\.net\.)?HttpURLConnection/u;
const CONNECTION = new RegExp(
  String.raw`^(?:val|var)\s+(\w+)\s*(?::[^=\n]*)?=[^\n]*${CONNECTION_CAST.source}[ \t]*$`,
  'u',
);
const TIMEOUT_PROPERTY = /\b(connectTimeout|readTimeout)\s*=|\bset(Connect|Read)Timeout\s*\(/gu;

function terminalBuild(code: string, offset: number, builder: RegExp): ChainedCall | undefined {
  const match = builder.exec(code.slice(offset));
  if (match === null) {
    return undefined;
  }
  const calls = chainedCalls(code, offset + match[0].length - 1);
  const last = calls.at(-1);
  return last?.name === 'build' ? last : undefined;
}

function beforeBuild(call: ChainedCall, text: string): KotlinEdit {
  return { start: call.dot, end: call.dot, text: `${text}${call.gap}` };
}

function requestEdits(code: string, offset: number): KotlinEdit[] {
  const build = terminalBuild(code, offset, REQUEST_BUILDER);
  return build === undefined
    ? []
    : [beforeBuild(build, `.timeout(java.time.Duration.ofSeconds(${String(SECONDS)}))`)];
}

function jaxRsEdits(code: string, offset: number): KotlinEdit[] {
  const build = terminalBuild(code, offset, JAX_RS_BUILDER);
  const unit = 'java.util.concurrent.TimeUnit.SECONDS';
  return build === undefined
    ? []
    : [
        beforeBuild(
          build,
          `.connectTimeout(${String(SECONDS)}, ${unit}).readTimeout(${String(SECONDS)}, ${unit})`,
        ),
      ];
}

function connectionEdits(code: string, offset: number): KotlinEdit[] {
  const lineEnd = code.indexOf('\n', offset);
  const end = lineEnd === -1 ? code.length : lineEnd;
  const name = CONNECTION.exec(code.slice(offset, end))?.[1];
  if (name === undefined || braceDepths(code)[offset] === 0) {
    return [];
  }
  const indent = /[ \t]*$/u.exec(code.slice(code.lastIndexOf('\n', offset) + 1, offset))?.[0] ?? '';
  const set = new Set([...code.matchAll(TIMEOUT_PROPERTY)].map((match) => match[1] ?? ''));
  const missing = ['connectTimeout', 'readTimeout'].filter((property) => !set.has(property));
  const lines = missing.map(
    (property) =>
      `\n${indent}${name}.${property} = ${String(SECONDS * 1000).replace(/(\d)(?=(\d{3})+$)/u, '$1_')}`,
  );
  return lines.length === 0 ? [] : [{ start: end, end, text: lines.join('') }];
}

function editsAt(code: string, offset: number): KotlinEdit[] {
  const rest = code.slice(offset);
  if (REQUEST_BUILDER.test(rest)) {
    return requestEdits(code, offset);
  }
  return JAX_RS_BUILDER.test(rest) ? jaxRsEdits(code, offset) : connectionEdits(code, offset);
}

export const kotlinHttpTimeoutRecipe = kotlinRecipe({
  id: 'kotlin-http-timeout',
  rules: [{ tool: 'kotlin-source', rule: 'HttpWithoutTimeout' }],
  safety: 'review',
  find(scanned): KotlinFound[] {
    return httpWithoutTimeout(scanned).flatMap(({ offset }) => {
      const edits = editsAt(scanned.code, offset);
      return edits.length === 0 ? [] : [{ offset, edits }];
    });
  },
});
