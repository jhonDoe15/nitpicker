import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { logTemplates, shellCommands } from './calls.mjs';

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
