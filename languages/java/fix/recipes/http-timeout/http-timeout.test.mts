import { describe, expect, it } from 'vitest';
import { recipeProject } from '../source/test-support/recipe-project.mts';
import { httpWithoutTimeoutRecipe as recipe } from './http-timeout.mts';

const RULE = 'pmd/HttpWithoutTimeout';
const REMOTE = 'src/main/java/shop/Remote.java';
const CLIENTS = 'src/main/java/shop/Clients.java';

const REMOTE_TEXT = `package shop;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.time.Duration;

public final class Remote {
  private static final Duration DEADLINE = Duration.ofSeconds(5);

  HttpRequest plain(URI uri) {
    return HttpRequest.newBuilder(uri).build();
  }

  HttpRequest timed(URI uri) {
    return HttpRequest.newBuilder(uri).timeout(DEADLINE).build();
  }

  HttpClient shared() {
    return HttpClient.newHttpClient();
  }

  HttpClient built() {
    return HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).build();
  }

  int status(URL url) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    return connection.getResponseCode();
  }

  int timedStatus(URL url) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    connection.setReadTimeout(2_000);
    return connection.getResponseCode();
  }
}
`;

const REMOTE_AFTER = REMOTE_TEXT.replace(
  'HttpRequest.newBuilder(uri).build()',
  'HttpRequest.newBuilder(uri).timeout(java.time.Duration.ofSeconds(10)).build()',
)
  .replace(
    'HttpClient.newHttpClient()',
    'HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(10)).build()',
  )
  .replace(
    'HttpClient.newBuilder().followRedirects',
    'HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(10)).followRedirects',
  )
  .replace(
    '    HttpURLConnection connection = (HttpURLConnection) url.openConnection();\n    return',
    '    HttpURLConnection connection = (HttpURLConnection) url.openConnection();\n    connection.setConnectTimeout(10_000);\n    connection.setReadTimeout(10_000);\n    return',
  );

const CLIENTS_TEXT = `package shop;

import jakarta.ws.rs.client.Client;
import jakarta.ws.rs.client.ClientBuilder;
import java.net.URI;
import java.net.http.HttpRequest;
import java.util.concurrent.TimeUnit;

public final class Clients {
  HttpRequest post(URI uri) {
    return HttpRequest.newBuilder().uri(uri).build();
  }

  Client fresh() {
    return ClientBuilder.newClient();
  }

  Client partial() {
    return ClientBuilder.newBuilder().connectTimeout(2, TimeUnit.SECONDS).build();
  }
}
`;

const CLIENTS_AFTER = CLIENTS_TEXT.replace(
  'newBuilder().uri(uri)',
  'newBuilder().timeout(java.time.Duration.ofSeconds(10)).uri(uri)',
)
  .replace(
    'ClientBuilder.newClient()',
    'ClientBuilder.newBuilder().connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS).readTimeout(10, java.util.concurrent.TimeUnit.SECONDS).build()',
  )
  .replace(
    'newBuilder().connectTimeout(2',
    'newBuilder().readTimeout(10, java.util.concurrent.TimeUnit.SECONDS).connectTimeout(2',
  );

describe('httpWithoutTimeoutRecipe', () => {
  it('is a review recipe for pmd/HttpWithoutTimeout in the Java preset', () => {
    expect([recipe.safety, recipe.scope, recipe.presets, recipe.rules]).toEqual([
      'review',
      'file',
      ['java'],
      [{ tool: 'pmd', rule: 'HttpWithoutTimeout' }],
    ]);
  });

  it('adds the deadline of each java.net.http and HttpURLConnection call that has none', () => {
    const { result, read } = recipeProject({ files: { [REMOTE]: REMOTE_TEXT }, rule: RULE });

    expect(result.toolErrors).toEqual([]);
    expect(read(REMOTE)).toBe(REMOTE_AFTER);
  });

  it('writes Duration and TimeUnit in full and sets both JAX-RS timeouts', () => {
    const { result, read } = recipeProject({ files: { [CLIENTS]: CLIENTS_TEXT }, rule: RULE });

    expect(result.toolErrors).toEqual([]);
    expect(read(CLIENTS)).toBe(CLIENTS_AFTER);
  });
});

describe('httpWithoutTimeoutRecipe chains and imports', () => {
  const HEAD = 'package shop;\n\nimport java.net.http.*;\n\npublic final class Wild {\n';

  it('fixes a finished builder chain that is assigned and a client of a wildcard import', () => {
    const text = `${HEAD}  HttpClient client = HttpClient.newBuilder().build();\n}\n`;
    const { read } = recipeProject({ files: { [REMOTE]: text }, rule: RULE });

    expect(read(REMOTE)).toBe(
      text.replace('newBuilder()', 'newBuilder().connectTimeout(java.time.Duration.ofSeconds(10))'),
    );
  });

  it('leaves a javax ClientBuilder, whose first release has no timeouts', () => {
    const text = `package shop;\n\nimport javax.ws.rs.client.ClientBuilder;\n\npublic final class Old {\n  Object client() {\n    return ClientBuilder.newBuilder().build();\n  }\n}\n`;
    const { read } = recipeProject({ files: { [REMOTE]: text }, rule: RULE });

    expect(read(REMOTE)).toBe(text);
  });
});
