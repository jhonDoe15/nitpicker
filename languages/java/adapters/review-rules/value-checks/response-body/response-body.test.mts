import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../../max-value-sums/source-file.mjs';
import { RESPONSE_BODY_CHECK as untypedCheck } from './response-body.mjs';

type Found = { readonly line: number; readonly name: string };

const parseSource: (text: string, options: { file: string; kotlin: boolean }) => unknown =
  untypedParse;
const check: { find: (source: unknown) => Found[] } = untypedCheck;

function lines(body: string, kotlin = false): number[] {
  const wrapped = `class A {\n${body}\n}\n`;
  return check
    .find(parseSource(wrapped, { file: kotlin ? 'A.kt' : 'A.java', kotlin }))
    .map(({ line }) => line);
}

describe('UncheckedResponseBody in Java', () => {
  it('reports a body mapped as JSON before the status is read', () => {
    expect(
      lines(
        [
          'Foo load(HttpClient client, HttpRequest request) throws Exception {',
          '  HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
          '  return mapper.readValue(response.body(), Foo.class);',
          '}',
        ].join('\n'),
      ),
    ).toEqual([4]);
  });

  it('reports a body copied to a local that is then parsed', () => {
    expect(
      lines(
        [
          'Foo load(HttpClient client, HttpRequest request) throws Exception {',
          '  var response = client.send(request, BodyHandlers.ofString());',
          '  String text = response.body();',
          '  return gson.fromJson(text, Foo.class);',
          '}',
        ].join('\n'),
      ),
    ).toEqual([4]);
  });

  it('reports an OkHttp body parsed first', () => {
    expect(
      lines(
        [
          'Foo load(OkHttpClient client, Request request) throws Exception {',
          '  Response response = client.newCall(request).execute();',
          '  return mapper.readValue(response.body().string(), Foo.class);',
          '}',
        ].join('\n'),
      ),
    ).toEqual([4]);
  });

  it('leaves a response whose status is read first', () => {
    expect(
      lines(
        [
          'Foo load(HttpClient client, HttpRequest request) throws Exception {',
          '  HttpResponse<String> response = client.send(request, BodyHandlers.ofString());',
          '  if (response.statusCode() != 200) { throw new IOException("status"); }',
          '  return mapper.readValue(response.body(), Foo.class);',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('leaves a body that is not parsed as JSON, and other clients', () => {
    expect(
      lines(
        [
          'String load(HttpClient client, HttpRequest request) throws Exception {',
          '  HttpResponse<String> response = client.send(request, BodyHandlers.ofString());',
          '  return response.body();',
          '}',
          'Foo other(RestClient rest) throws Exception {',
          '  var response = rest.execute();',
          '  return mapper.readValue(response.body(), Foo.class);',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('leaves OkHttp when isSuccessful is read first', () => {
    expect(
      lines(
        [
          'Foo load(OkHttpClient client, Request request) throws Exception {',
          '  Response response = client.newCall(request).execute();',
          '  if (!response.isSuccessful()) { throw new IOException("x"); }',
          '  return mapper.readValue(response.body().string(), Foo.class);',
          '}',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('UncheckedResponseBody in Kotlin', () => {
  it('reports a body decoded before the status is read', () => {
    expect(
      lines(
        [
          'fun load(client: HttpClient, request: HttpRequest): Foo {',
          '  val response = client.send(request, HttpResponse.BodyHandlers.ofString())',
          '  return Json.decodeFromString(response.body())',
          '}',
        ].join('\n'),
        true,
      ),
    ).toEqual([4]);
  });

  it('leaves a status check first', () => {
    expect(
      lines(
        [
          'fun load(client: HttpClient, request: HttpRequest): Foo {',
          '  val response = client.send(request, HttpResponse.BodyHandlers.ofString())',
          '  check(response.statusCode() == 200)',
          '  return Json.decodeFromString(response.body())',
          '}',
        ].join('\n'),
        true,
      ),
    ).toEqual([]);
  });
});
