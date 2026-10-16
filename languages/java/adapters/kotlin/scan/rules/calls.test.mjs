import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { ioInLoops, logTemplates, shellCommands } from './calls.mjs';

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
    ['a template expression', 'logger.debug("user ${user.trim()}")'],
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
  ])('passes %s', (_name, line) => {
    expect(found(logTemplates, body([line]))).toEqual([]);
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
    ['a file read in map', ['items.map { java.io.File(it).readText() }']],
    ['a Files call in a while loop', ['while (true) {', '    Files.readString(path)', '}']],
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
  ])('passes %s', (_name, lines) => {
    expect(found(ioInLoops, body(lines))).toEqual([]);
  });
});
