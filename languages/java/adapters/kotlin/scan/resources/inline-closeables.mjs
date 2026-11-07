import { closingIndex, inImport } from '../kotlin-source.mjs';
import { LOOKBEHIND, chainStart, openedCloseables, segmentBefore } from './closeable-calls.mjs';

const RULE = 'UnclosedInlineResource';
const NEXT_MEMBER = /^(?:\s|!|\?)*\.\s*([A-Za-z_]\w*)/;
const ARGUMENT_BEFORE = /[(,]\s*(?:[A-Za-z_]\w*\s*=\s*)?$/;
const ARGUMENT_AFTER = /^\s*[),]/;
const LOOP_SOURCE = /\bfor\s*\([\w\s,()]+?\bin\s*$/;
const CLOSING = new Set(['use', 'useLines', 'forEachLine', 'readLines', 'close']);
const MEMBER_WRAPPERS = new Set([
  'buffered',
  'bufferedReader',
  'bufferedWriter',
  'reader',
  'writer',
  'printWriter',
]);
const WRAPPERS = new Set([
  'BufferedReader',
  'BufferedWriter',
  'InputStreamReader',
  'OutputStreamWriter',
  'BufferedInputStream',
  'BufferedOutputStream',
  'GZIPInputStream',
  'GZIPOutputStream',
  'ZipInputStream',
  'ZipOutputStream',
  'JarInputStream',
  'JarOutputStream',
  'InflaterInputStream',
  'DeflaterOutputStream',
  'DataInputStream',
  'DataOutputStream',
  'ObjectInputStream',
  'ObjectOutputStream',
  'PrintWriter',
  'PrintStream',
  'Scanner',
  'LineNumberReader',
  'PushbackReader',
  'PushbackInputStream',
  'CheckedInputStream',
  'CheckedOutputStream',
  'DigestInputStream',
  'DigestOutputStream',
  'CipherInputStream',
  'CipherOutputStream',
  'requireNotNull',
  'checkNotNull',
]);
const OWNERS =
  /^(?:close\w*|register|exit|readValue|readTree|add\w*|put\w*|offer\w*|push|set[A-Z]\w*|listOf|setOf|of|ofNullable)$/;
const CLOSING_OWNERS = new Set(['FileCopyUtils']);

export const INLINE_CLOSEABLE_MESSAGES = {
  [RULE]:
    'Close what this opens: `resource.inputStream.use { it.readBytes() }`, `FileInputStream(file).bufferedReader().use { it.readLine() }`, or a variable passed to `.use { }`. The closeable (a stream, reader, writer, channel, JAR or ZIP file, class loader or JDBC connection) is opened and used in the same expression, as the receiver of a call, an argument or a loop source, so nothing closes it: each call leaks a file handle or a connection, and on Windows the file stays locked. `readLines()`, `useLines { }` and `forEachLine { }` close the reader, and returning the closeable or passing it to a closeable wrapper that is closed also matches.',
};

function enclosingCall(code, start) {
  const marks = [...code.slice(0, start).matchAll(/[()[\]{}]/g)].toReversed();
  let depth = 0;
  for (const { index, 0: mark } of marks) {
    if (depth === 0 && '([{'.includes(mark)) {
      return mark === '(' ? index : -1;
    }
    depth += ')]}'.includes(mark) ? 1 : -1;
  }
  return -1;
}

function argumentOwner(code, span) {
  const open = enclosingCall(code, span.start);
  const callee = open === -1 ? undefined : segmentBefore(code, open);
  if (callee === undefined || callee.call) {
    return { kind: 'argument' };
  }
  if (WRAPPERS.has(callee.name)) {
    return {
      kind: 'wrapped',
      span: { start: chainStart(code, callee.start), end: closingIndex(code, open) + 1 },
    };
  }
  const delegated = /(?<!\?):\s*$/.test(
    code.slice(Math.max(0, callee.start - LOOKBEHIND), callee.start),
  );
  const closedResult = NEXT_MEMBER.exec(code.slice(closingIndex(code, open) + 1))?.[1] === 'use';
  const owned =
    delegated || closedResult || OWNERS.test(callee.name) || CLOSING_OWNERS.has(callee.qualifier);
  return { kind: owned ? 'owned' : 'argument' };
}

function memberEnd(code, from) {
  const open = /^\s*(?:<[^<>()]*>\s*)?\(/.exec(code.slice(from));
  return open === null ? from : closingIndex(code, from + open[0].length - 1) + 1;
}

function nextUse(code, span) {
  const member = NEXT_MEMBER.exec(code.slice(span.end));
  if (member !== null) {
    if (CLOSING.has(member[1])) {
      return { kind: 'owned' };
    }
    if (MEMBER_WRAPPERS.has(member[1])) {
      return {
        kind: 'wrapped',
        span: { start: span.start, end: memberEnd(code, span.end + member[0].length) },
      };
    }
    return { kind: 'receiver' };
  }
  const before = code.slice(Math.max(0, span.start - LOOKBEHIND), span.start);
  if (ARGUMENT_BEFORE.test(before) && ARGUMENT_AFTER.test(code.slice(span.end))) {
    return argumentOwner(code, span);
  }
  return { kind: LOOP_SOURCE.test(before) ? 'loop' : 'owned' };
}

function inlineUse(code, opened) {
  const pending = [{ span: opened, use: nextUse(code, opened) }];
  for (const { use } of pending) {
    if (use.kind === 'wrapped') {
      pending.push({ span: use.span, use: nextUse(code, use.span) });
    }
  }
  const { span, use } = pending.at(-1);
  return use.kind === 'owned' ? undefined : span;
}

export function unclosedInlineResources(scanned) {
  const { code, source } = scanned;
  const reported = new Set();
  return openedCloseables(code).flatMap((opened) => {
    if (inImport(code, opened.start)) {
      return [];
    }
    const used = inlineUse(code, opened);
    if (used === undefined || reported.has(used.start)) {
      return [];
    }
    reported.add(used.start);
    const subject = source.slice(opened.start, opened.end).replaceAll(/\s+/g, ' ');
    return [{ rule: RULE, offset: opened.start, subject }];
  });
}
