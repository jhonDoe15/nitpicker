import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../test-support/apply-recipe.mts';
import { kotlinHttpTimeoutRecipe } from './http-timeout.mts';

const wrap = (lines: string[]): string =>
  [
    'package demo',
    '',
    'fun call(uri: URI, url: String) {',
    ...lines.map((line) => `    ${line}`),
    '}',
    '',
  ].join('\n');
const fix = (lines: string[]): string => applyRecipe(kotlinHttpTimeoutRecipe, wrap(lines));

describe('kotlinHttpTimeoutRecipe', () => {
  it('adds a request timeout before build, keeping a multi-line chain', () => {
    expect(fix(['val one = HttpRequest.newBuilder(uri).GET().build()'])).toBe(
      wrap([
        'val one = HttpRequest.newBuilder(uri).GET().timeout(java.time.Duration.ofSeconds(10)).build()',
      ]),
    );
    expect(fix(['val request = HttpRequest.newBuilder()', '    .uri(uri)', '    .build()'])).toBe(
      wrap([
        'val request = HttpRequest.newBuilder()',
        '    .uri(uri)',
        '    .timeout(java.time.Duration.ofSeconds(10))',
        '    .build()',
      ]),
    );
  });
  it('adds the JAX-RS client timeouts before build', () => {
    expect(fix(['val client = ClientBuilder.newBuilder().build()'])).toBe(
      wrap([
        'val client = ClientBuilder.newBuilder().connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS).readTimeout(10, java.util.concurrent.TimeUnit.SECONDS).build()',
      ]),
    );
  });
  it('sets the missing timeouts on an HttpURLConnection', () => {
    expect(fix(['val connection = URL(url).openConnection() as HttpURLConnection'])).toBe(
      wrap([
        'val connection = URL(url).openConnection() as HttpURLConnection',
        'connection.connectTimeout = 10_000',
        'connection.readTimeout = 10_000',
      ]),
    );
    expect(
      fix([
        'val connection = URL(url).openConnection() as HttpURLConnection',
        'connection.connectTimeout = 5_000',
      ]),
    ).toBe(
      wrap([
        'val connection = URL(url).openConnection() as HttpURLConnection',
        'connection.readTimeout = 10_000',
        'connection.connectTimeout = 5_000',
      ]),
    );
  });
  it('reports the line of each finding', () => {
    expect(
      plannedLines(kotlinHttpTimeoutRecipe, wrap(['val a = HttpRequest.newBuilder(uri).build()'])),
    ).toEqual([4]);
  });
  it('leaves requests with a timeout and clients it cannot configure alone', () => {
    const lines = [
      'val timed = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(3)).build()',
      'val template = RestTemplate()',
      'val client = HttpClients.createDefault()',
      'val body = URL(url).readText()',
      'val jax = ClientBuilder.newClient().target(url)',
    ];

    expect(fix(lines)).toBe(wrap(lines));
    const main = wrap(['val a = HttpRequest.newBuilder(uri).build()']);

    expect(applyRecipe(kotlinHttpTimeoutRecipe, main, 'src/test/kotlin/demo/A.kt')).toBe(main);
  });
  it('leaves a top-level connection alone', () => {
    const text =
      'package demo\n\nval connection = URL("http://x").openConnection() as HttpURLConnection\n';

    expect(applyRecipe(kotlinHttpTimeoutRecipe, text)).toBe(text);
  });
});
