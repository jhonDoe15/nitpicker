import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { httpWithoutTimeout, unsafeDeserialization } from './clients.mjs';

function found(check, lines) {
  const source = `fun call(url: String, uri: URI) {\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => lineOf(scanned, reported.offset));
}

describe('httpWithoutTimeout', () => {
  it.each([
    ['a java.net.http request', ['val request = HttpRequest.newBuilder(uri).GET().build()']],
    [
      'a request over lines',
      [
        'val request = HttpRequest.newBuilder()',
        '    .uri(uri)',
        '    .header("Accept", "application/json")',
        '    .build()',
      ],
    ],
    [
      'an HttpURLConnection',
      [
        'val connection = URL(url).openConnection() as HttpURLConnection',
        'connection.connectTimeout = 5_000',
      ],
    ],
    [
      'a connection read at once',
      ['val body = URL(url).openConnection().getInputStream().readBytes()'],
    ],
    ['a URL read as text', ['val body = URL(url).readText()']],
    ['a URI read as a stream', ['val stream = uri.toURL().openStream()']],
    ['a plain RestTemplate', ['val template = RestTemplate()']],
    ['the default Apache client', ['val client = HttpClients.createDefault()']],
  ])('flags %s', (_name, lines) => {
    expect(found(httpWithoutTimeout, lines)).toEqual([2]);
  });

  it.each([
    [
      'a request with a timeout',
      ['val request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).GET().build()'],
    ],
    [
      'a builder kept for later',
      ['val builder = HttpRequest.newBuilder(uri)', 'builder.timeout(Duration.ofSeconds(10))'],
    ],
    [
      'a connection with timeouts',
      [
        'val connection = (URL(url).openConnection() as HttpURLConnection).apply {',
        '    connectTimeout = 5_000',
        '    readTimeout = 10_000',
        '}',
      ],
    ],
    [
      'a setter-style connection',
      [
        'val connection = URL(url).openConnection() as HttpURLConnection',
        'connection.setReadTimeout(10_000)',
      ],
    ],
    [
      'a class-path resource',
      [
        'val text = javaClass.getResource("/schema.json").readText()',
        'val stream = resourceUrl(url).openConnection()',
      ],
    ],
    ['a local file', ['val text = File(url).readText()']],
    [
      'OkHttp, which has default timeouts',
      [
        'val client = OkHttpClient.Builder().callTimeout(Duration.ofSeconds(10)).build()',
        'val plain = OkHttpClient()',
      ],
    ],
    [
      'Ktor with a timeout',
      ['val client = HttpClient(CIO) { install(HttpTimeout) { requestTimeoutMillis = 10_000 } }'],
    ],
    ['a RestTemplate from a factory', ['val template = RestTemplate(factory)']],
    [
      'a configured Apache client',
      ['val client = HttpClients.custom().setDefaultRequestConfig(config).build()'],
    ],
  ])('passes %s', (_name, lines) => {
    expect(found(httpWithoutTimeout, lines)).toEqual([]);
  });
});

describe('unsafeDeserialization', () => {
  it.each([
    ['XMLDecoder', ['val value = XMLDecoder(input).readObject()']],
    ['Jackson default typing', ['mapper.enableDefaultTyping()']],
    [
      'a permissive type validator',
      ['mapper.activateDefaultTyping(LaissezFaireSubTypeValidator.instance)'],
    ],
    [
      'class names in the data',
      ['@JsonTypeInfo(use = JsonTypeInfo.Id.CLASS) val payload: Any? = null'],
    ],
    ['a serialization helper', ['val value = SerializationUtils.deserialize<Order>(bytes)']],
    ['Kryo without registration', ['kryo.isRegistrationRequired = false']],
  ])('flags %s', (_name, lines) => {
    expect(found(unsafeDeserialization, lines)).toEqual([2]);
  });

  it.each([
    ['kotlinx.serialization', ['val order = Json.decodeFromString<Order>(text)']],
    ['Jackson into a concrete type', ['val order = mapper.readValue<Order>(text)']],
    [
      'logical type names',
      ['@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type") val payload: Event? = null'],
    ],
    [
      'a restricted type validator',
      [
        'mapper.activateDefaultTyping(BasicPolymorphicTypeValidator.builder().allowIfSubType("shop.").build())',
      ],
    ],
    ['Kryo with registration', ['kryo.isRegistrationRequired = true']],
  ])('passes %s', (_name, lines) => {
    expect(found(unsafeDeserialization, lines)).toEqual([]);
  });
});
