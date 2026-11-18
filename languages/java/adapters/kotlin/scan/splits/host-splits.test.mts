import { describe, expect, it } from 'vitest';
import { type Check, type Ruled, scanKotlinSource } from '../typed/typed-scan.mts';
import { hostPortSplits as untypedHostPortSplits } from './host-splits.mjs';

const hostPortSplits: Check<Ruled> = untypedHostPortSplits;

function found(body: string) {
  return hostPortSplits(
    scanKotlinSource(`fun parse(host: String, request: Request) {\n${body}\n}\n`),
  ).length;
}

describe('hostPortSplits', () => {
  it.each([
    ['a split of host', '    val name = host.split(":")[0]'],
    ['substringBefore on host', '    val name = host.substringBefore(":")'],
    ['substringAfter on a hostname', '    val port = hostname.substringAfter(":")'],
    ['a host-named property', "    val name = proxyHost.substringBefore(':')"],
    ['a property of a value', '    val name = config.host.split(":").first()'],
    ['a safe call', '    val name = host?.split(":")?.first()'],
    ['a header read', '    val name = request.headers["Host"]!!.split(":")[0]'],
    [
      'a getHeader call',
      '    val name = request.getHeader("X-Forwarded-Host").substringBefore(":")',
    ],
    ['an authority', '    val name = authority.substringBefore(":")'],
  ])('reports %s', (_name, body) => {
    expect(found(body)).toBe(1);
  });

  it.each([
    ['another receiver', '    val name = line.split(":")[0]'],
    ['another separator', '    val name = host.split("/")[0]'],
    ['substringBeforeLast', '    val name = host.substringBeforeLast(":")'],
    ['another header', '    val name = request.headers["Accept"]!!.split(":")[0]'],
    ['a name that only ends like a host', '    val name = ghost.split(":")[0]'],
    ['a string literal', '    val text = "host.split(\\":\\")"'],
    ['a comment', '    // host.split(":")'],
    [
      'a bracket check in the file',
      '    if (host.startsWith("[")) return\n    val name = host.split(":")[0]',
    ],
  ])('leaves %s alone', (_name, body) => {
    expect(found(body)).toBe(0);
  });
});
