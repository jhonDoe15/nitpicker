import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { processWaitsWithoutTimeout } from './process-waits.mjs';

function lines(source) {
  const scanned = scanKotlinSource(source);
  return processWaitsWithoutTimeout(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const TIMED =
  '    if (!process.waitFor(30, TimeUnit.SECONDS)) {\n        process.destroyForcibly()\n    }\n';

describe('processWaitsWithoutTimeout', () => {
  it.each([
    [
      'a wait without arguments',
      'fun run(cmd: List<String>): Int =\n    ProcessBuilder(cmd).start().waitFor()\n',
      [2],
    ],
    [
      'a wait on a held process',
      'fun run(cmd: List<String>): Int {\n    val process = ProcessBuilder(cmd).start()\n    return process.waitFor()\n}\n',
      [3],
    ],
    [
      'reading the whole output of a held process',
      'fun run(cmd: List<String>): String {\n    val process = ProcessBuilder(cmd)\n        .redirectErrorStream(true)\n        .start()\n    return process.inputStream.bufferedReader().readText()\n}\n',
      [5],
    ],
    [
      'reading the output of a started process in one chain',
      'fun run(cmd: List<String>): ByteArray =\n    ProcessBuilder(cmd).start()\n        .inputStream\n        .readBytes()\n',
      [2],
    ],
    [
      'a chain on the last line of the file',
      'fun run(cmd: List<String>): ByteArray = ProcessBuilder(cmd).start().inputStream.readBytes()',
      [1],
    ],
    [
      'reading the errors of Runtime.exec and of a Process parameter',
      'fun run(cmd: String): List<String> {\n    val child = Runtime.getRuntime().exec(arrayOf(cmd))\n    return child.errorStream.bufferedReader().readLines()\n}\n\nfun drain(process: Process): String = process.inputStream.bufferedReader().use { it.readText() }\n',
      [3, 6],
    ],
    [
      'reading the output of a Process parameter in a block body',
      'fun drain(process: Process): String {\n    return process.inputStream.bufferedReader().readText()\n}\n',
      [2],
    ],
    [
      'a held stream or reader read later',
      'fun run(cmd: List<String>): String {\n    val process = ProcessBuilder(cmd).start()\n    val reader = process.inputStream.bufferedReader()\n    return reader.readLine()\n}\n',
      [3],
    ],
    [
      'onExit().join()',
      'fun run(cmd: List<String>): Process = ProcessBuilder(cmd).start().onExit().join()\n',
      [1],
    ],
    [
      'reading the whole output before a timed wait',
      `fun run(cmd: List<String>): ByteArray {\n    val process = ProcessBuilder(cmd).start()\n    val bytes = process.inputStream.readBytes()\n${TIMED}    return bytes\n}\n`,
      [3],
    ],
  ])('reports %s', (_name, source, expected) => {
    expect(lines(source)).toEqual(expected);
  });

  it.each([
    [
      'a timed wait',
      `fun run(cmd: List<String>): Int {\n    val process = ProcessBuilder(cmd).start()\n${TIMED}    return process.exitValue()\n}\n`,
    ],
    [
      'reading the output in a function with a timed wait',
      `fun run(cmd: List<String>): String {\n    val process = ProcessBuilder(cmd).start()\n    val output = CompletableFuture.supplyAsync { process.inputStream.readBytes() }\n${TIMED}    return String(output.join())\n}\n`,
    ],
    [
      'reading a file or a connection',
      'fun read(file: java.io.File, url: java.net.URL): String {\n    val bytes = file.inputStream().readBytes()\n    return url.openStream().reader().readText() + bytes.size\n}\n',
    ],
    [
      'an input stream that is not a process',
      'fun read(socket: java.net.Socket): ByteArray {\n    val stream = socket.inputStream\n    return socket.inputStream.readBytes()\n}\n',
    ],
    ['a wait in a comment or a string', 'fun note(): String = "call waitFor()" // waitFor()\n'],
    ['a project method with a similar name', 'fun run(job: Job) = job.awaitFor()\n'],
    [
      'a project function named waitFor',
      'class Waiter {\n    fun waitFor() {}\n\n    fun run() {\n        waitFor()\n    }\n}\n',
    ],
    [
      'reading the output after a timed wait',
      `fun run(cmd: List<String>): ByteArray {\n    val process = ProcessBuilder(cmd).start()\n${TIMED}    return process.inputStream.readBytes()\n}\n`,
    ],
  ])('passes %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });
});
