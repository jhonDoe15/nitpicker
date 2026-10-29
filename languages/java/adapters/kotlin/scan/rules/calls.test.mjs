import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { ioInLoops, logTemplates, shellCommands, standardStreams } from './calls.mjs';

function found(check, source) {
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => [reported.rule, lineOf(scanned, reported.offset)]);
}

function body(lines) {
  return `fun f(user: String, repo: Repo, items: List<String>) {\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;
}

describe('logTemplates', () => {
  it.each([
    ['a string template', 'log.info("user $user")'],
    ['a template expression', 'logger.info("user ${user.trim()}")'],
    ['a warn level', 'log.warn("user $user")'],
    ['a JUL config level', 'log.config("user $user")'],
    ['a constant next to a runtime value', 'log.info("$APP user " + user)'],
    ['a concatenation', 'LOGGER.warn("user " + user)'],
    ['a format call', 'log.error(String.format("user %s", user))'],
    ['a format extension', 'log.info("user %s".format(user))'],
    ['a companion logger', 'this.orderLogger.info("user $user")'],
    ['a java.util.logging level', 'log.severe("user $user")'],
    ['a level argument', 'log.log(Level.INFO, "user $user")'],
  ])('flags %s in the message of a log call', (_name, line) => {
    expect(found(logTemplates, body([line]))).toEqual([['LogStringConcatenation', 2]]);
  });

  it.each([
    ['placeholders', 'log.info("user {}", user)'],
    ['a lambda message', 'logger.info { "user $user" }'],
    ['a plain literal', 'log.info("started")'],
    ['an escaped dollar', 'log.info("costs \\$5")'],
    ['a template outside the message', 'log.info("user {}", "<$user>")'],
    ['a call on something that is not a logger', 'catalog.info("user $user")'],
    ['a print, which detekt reports', 'println("user $user")'],
    ['a template in a comment', '// log.info("user $user")'],
    ['a debug level, which GuardLogStatement covers in Java', 'log.debug("cache miss for $user")'],
    ['a trace level', 'log.trace("user $user")'],
    ['an Android level', 'Log.d(TAG, "user $user")'],
  ])('passes %s', (_name, line) => {
    expect(found(logTemplates, body([line]))).toEqual([]);
  });

  it.each([
    ['a concatenated const val', 'log.info("Starting " + APP)'],
    ['a const val in a template', 'log.info("Starting $APP")'],
    ['a lowercase const val in a template', 'log.info("Starting ${name}")'],
    ['an object constant', 'log.info("Starting " + Names.APP + " " + 2)'],
  ])('passes %s, a compile-time constant', (_name, line) => {
    const source = `private const val APP = "orders"\nprivate const val name = "orders"\n${body([line])}`;

    expect(found(logTemplates, source)).toEqual([]);
  });
});

describe('shellCommands', () => {
  it.each([
    ['sh -c', 'ProcessBuilder("sh", "-c", "ls $user").start()'],
    ['bash -c through a list', 'ProcessBuilder(listOf("/bin/bash", "-c", user)).start()'],
    ['cmd /c', 'ProcessBuilder("cmd.exe", "/c", "dir").start()'],
    ['powershell -Command', 'ProcessBuilder("powershell", "-Command", user).start()'],
  ])('flags a shell run with %s', (_name, line) => {
    expect(found(shellCommands, body([line]))).toEqual([['ShellCommand', 2]]);
  });

  it.each([
    ['an argument list', 'ProcessBuilder("git", "log", user).start()'],
    ['a shell running a script file', 'ProcessBuilder("sh", "build.sh").start()'],
    ['a flag that is not -c', 'ProcessBuilder("bash", "--version").start()'],
  ])('passes %s', (_name, line) => {
    expect(found(shellCommands, body([line]))).toEqual([]);
  });
});

describe('ioInLoops', () => {
  it.each([
    ['a repository call in a for loop', ['for (item in items) {', '    repo.save(item)', '}']],
    ['a repository call in forEach', ['items.forEach { repository.findById(it) }']],
    [
      'a call in a while loop whose condition the call does not feed',
      [
        'var index = 0',
        'while (index < items.size) {',
        '    repo.save(items[index])',
        '    index++',
        '}',
      ],
    ],
    [
      'a call in a try of a loop that never leaves it',
      [
        'for (item in items) {',
        '    try {',
        '        repo.save(item)',
        '    } catch (e: IOException) {',
        '        failed.add(item)',
        '    }',
        '}',
      ],
    ],
  ])('flags %s', (_name, lines) => {
    expect(found(ioInLoops, body(lines)).map(([rule]) => rule)).toEqual(['IoCallInLoop']);
  });

  it.each([
    ['a batch call', ['repo.saveAll(items)']],
    [
      'a batch call in a loop',
      ['for (chunk in items.chunked(10)) {', '    repo.saveAll(chunk)', '}'],
    ],
    [
      'a call outside the loop',
      ['val all = repo.findAll()', 'for (item in all) {', '    check(item != "")', '}'],
    ],
    ['a call on the loop item', ['for (item in items) {', '    item.trim()', '}']],
    [
      'a paging loop that breaks on an empty page',
      [
        'var page = 0',
        'while (true) {',
        '    val batch = repository.findAll(PageRequest.of(page, 100))',
        '    if (batch.isEmpty) break',
        '    page++',
        '}',
      ],
    ],
    [
      'a cursor loop whose condition reads what the call returned',
      [
        'var cursor: String? = null',
        'do {',
        '    val response = client.fetch(cursor)',
        '    cursor = response.next',
        '} while (cursor != null)',
      ],
    ],
    [
      'a polling loop',
      [
        'var done = false',
        'while (!done) {',
        '    val status = client.get(job)',
        '    done = status.finished',
        '}',
      ],
    ],
    [
      'a loop that leaves on a null page',
      [
        'while (true) {',
        '    val page = api.fetchPage(token) ?: break',
        '    token = page.next',
        '}',
      ],
    ],
    [
      'a retry loop',
      [
        'for (attempt in 1..3) {',
        '    try {',
        '        return client.send(request, BodyHandlers.ofString()).body()',
        '    } catch (e: java.io.IOException) {',
        '        log.warn("attempt {} failed", attempt, e)',
        '    }',
        '}',
      ],
    ],
    ['a file read per item', ['items.map { Files.readString(Path.of(it)) }']],
    ['a file read in a loop', ['for (item in items) {', '    java.io.File(item).readText()', '}']],
  ])('passes %s', (_name, lines) => {
    expect(found(ioInLoops, body(lines))).toEqual([]);
  });
});

describe('standardStreams', () => {
  it.each([
    ['System.out', 'System.out.append(text)'],
    ['System.err', 'System.err.println(text)'],
    ['a qualified System.out', 'java.lang.System.out.append(text)'],
    ['a stream passed on', 'show(System.out)'],
    ['a method reference', 'items.forEach(System.out::println)'],
    ['an import of the stream', 'import java.lang.System.out'],
    ['an import renamed', 'import java.lang.System.err as stderr'],
  ])('flags %s outside the entry point', (_name, line) => {
    expect(found(standardStreams, `${line}\n`)).toEqual([['StandardStreamOutsideEntryPoint', 1]]);
  });

  it.each([
    ['a parameter', 'fun show(out: Appendable) {\n    out.append("x")\n}\n'],
    ['a stream replaced', 'fun capture() {\n    System.setOut(stream)\n}\n'],
    ['a member named out', 'fun show(sink: Sink) = sink.out.append("x")\n'],
    ['a name that only starts like it', 'val a = System.output\n'],
    ['a comment', '// System.out.append("x")\nfun f() {}\n'],
    ['a string', 'val a = "System.out"\n'],
    ['the entry point', 'fun main() {\n    show(System.out, System.err)\n}\n'],
    ['the entry point with a reference', 'fun main() = items.forEach(System.out::println)\n'],
    ['a Spring application', '@SpringBootApplication\nclass App {\n    val out = System.out\n}\n'],
  ])('passes %s', (_name, source) => {
    expect(found(standardStreams, source)).toEqual([]);
  });
});
