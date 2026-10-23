import { describe, expect, it } from 'vitest';
import { normalizeConsoleMessage } from './console-messages.mjs';

describe('console output as JVM builds and test runners write it', () => {
  it.each([
    ['a Duration.toString', 'took PT1M12.345S', 'took PT0.5S', 'took <duration>'],
    ['a Duration with hours', 'took PT3H2M', 'took PT1H59M', 'took <duration>'],
    ['minutes and seconds', 'retry in 1m2s', 'retry in 12m40s', 'retry in <duration>'],
    ['days and hours', 'expires in 3d4h', 'expires in 10d23h', 'expires in <duration>'],
    ['hours, minutes and seconds', 'elapsed 1h2m3s', 'elapsed 11h52m30s', 'elapsed <duration>'],
    [
      'a java.util.logging clock line',
      'Oct 17, 2026 3:04:05 AM com.shop.Cart load',
      'Nov 2, 2027 11:59:58 PM com.shop.Cart load',
      '<time> com.shop.Cart load',
    ],
    [
      'a Mockito mock class with a number',
      'created Cart$MockitoMock$1234567890 for test',
      'created Cart$MockitoMock$987654 for test',
      'created Cart$MockitoMock$<id> for test',
    ],
    [
      'a Mockito mock class with letters',
      'Order$MockitoMock$aB3dE9xQ created',
      'Order$MockitoMock$Zq81PlmW created',
      'Order$MockitoMock$<id> created',
    ],
    [
      'a Spring CGLIB proxy class',
      'proxy OrderService$$SpringCGLIB$$0 ready',
      'proxy OrderService$$SpringCGLIB$$3 ready',
      'proxy OrderService$$SpringCGLIB$$<n> ready',
    ],
    ['a counter on a short word', 'closing conn6', 'closing conn12', 'closing conn<n>'],
    ['colors as Gradle writes them', '?[31mred text?[0m', '?[1;33mred text?[39m', 'red text'],
    [
      'colors as Surefire writes them',
      '&#27;[31mred&#27;[0m',
      '&amp;#27;[31mred&amp;#27;[0m',
      'red',
    ],
    ['a control character', 'nul?char', 'nul&amp;#0;char', 'nulchar'],
    ['a lone surrogate', 'bad?char', 'bad\uD800char', 'badchar'],
  ])('gives one message for %s', (_name, first, second, expected) => {
    expect([normalizeConsoleMessage(first), normalizeConsoleMessage(second)]).toEqual([
      expected,
      expected,
    ]);
  });

  it.each([
    ['took PT1M12.345S', 'waited PT1M12.345S'],
    ['retry in 1m2s', 'retry after 1m2s'],
    ['Oct 17, 2026 3:04:05 AM com.shop.Cart load', 'Oct 17, 2026 3:04:05 AM com.shop.Cart save'],
    ['created Cart$MockitoMock$123 for test', 'created Order$MockitoMock$123 for test'],
    ['closing conn6', 'closing pool6'],
    ['?[31mred text?[0m', '?[31mblue text?[0m'],
    ['nul?char', 'nul?chars'],
  ])('keeps %j apart from %j', (first, second) => {
    expect(normalizeConsoleMessage(first)).not.toBe(normalizeConsoleMessage(second));
  });

  it('keeps a question mark that ends a word', () => {
    expect(normalizeConsoleMessage('is it ok? yes')).toBe('is it ok? yes');
  });
});
