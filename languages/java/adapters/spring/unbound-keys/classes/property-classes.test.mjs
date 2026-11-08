import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSource } from '../source-keys.mjs';
import { propertyClassKeys } from './property-classes.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function keysOf(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-properties-'));
  roots.push(root);
  const sources = Object.entries(files).map(([name, lines]) => {
    writeFileSync(path.join(root, name), lines.join('\n'));
    return readSource(path.join(root, name));
  });
  const { owned, exact, open } = propertyClassKeys(sources);
  return { owned: owned.sort(), exact: exact.sort(), open: open.sort() };
}

describe('propertyClassKeys', () => {
  it('reads a Java class: fields, setters, nested classes, collections and maps', () => {
    expect(
      keysOf({
        'MailProperties.java': [
          '@Validated',
          '@ConfigurationProperties(prefix = "app.mail")',
          'public class MailProperties extends BaseProperties {',
          '  private static final String DEFAULT = "x";',
          '  @NotBlank private String host;',
          '  private int[] ports = {25, 587};',
          '  private final Retry retry = new Retry();',
          '  private List<Recipient> recipients = new ArrayList<>();',
          '  private Map<String, String> headers;',
          '  private Duration timeout = Duration.ofSeconds(5);',
          '  private ExternalPool pool;',
          '  public void setReplyTo(String value) { this.replyTo = value; }',
          '  public String getHost() { return host; }',
          '  public static class Retry { private int maxAttempts; }',
          '  public record Recipient(String address, Kind kind) {}',
          '  public enum Kind { TO, CC }',
          '}',
        ],
        'BaseProperties.java': ['abstract class BaseProperties { protected boolean enabled; }'],
      }),
    ).toEqual({
      owned: ['app.mail', 'app.mail.recipients', 'app.mail.retry'],
      exact: [
        'app.mail.enabled',
        'app.mail.headers',
        'app.mail.host',
        'app.mail.pool',
        'app.mail.ports',
        'app.mail.recipients',
        'app.mail.recipients.address',
        'app.mail.recipients.kind',
        'app.mail.reply-to',
        'app.mail.retry',
        'app.mail.retry.max-attempts',
        'app.mail.timeout',
      ],
      open: ['app.mail.headers', 'app.mail.pool'],
    });
  });

  it('reads Java records, Kotlin data classes and Kotlin body properties', () => {
    expect(
      keysOf({
        'Limits.java': [
          '@ConfigurationProperties("app.limits")',
          'public record Limits(int perMinute, @DefaultValue("5") int burst) {}',
        ],
        'Shop.kt': [
          '@ConfigurationProperties("app.shop")',
          'data class ShopProperties(',
          '    val name: String,',
          '    val currency: Currency = Currency.EUR,',
          '    val tags: List<String> = emptyList(),',
          '    val payment: Payment? = null,',
          ') {',
          '    data class Payment(val provider: String, val keys: Map<String, String>)',
          '    var lateFee: BigDecimal = BigDecimal.ZERO',
          '    lateinit var region: String',
          '    companion object { const val DEFAULT = "x" }',
          '    fun label() = name',
          '}',
          'enum class Currency { EUR, USD }',
        ],
      }),
    ).toEqual({
      owned: ['app.limits', 'app.shop', 'app.shop.payment'],
      exact: [
        'app.limits.burst',
        'app.limits.per-minute',
        'app.shop.currency',
        'app.shop.late-fee',
        'app.shop.name',
        'app.shop.payment',
        'app.shop.payment.keys',
        'app.shop.payment.provider',
        'app.shop.region',
        'app.shop.tags',
      ],
      open: ['app.shop.payment.keys'],
    });
  });

  it('reads Kotlin use-site annotations, several fields in one declaration and @Name', () => {
    expect(
      keysOf({
        'Retry.kt': [
          '@ConfigurationProperties("app.retry")',
          'class RetryProperties(@field:NotBlank val name: String, @param:DefaultValue("3") @get:Min(1) val count: Int) {',
          '    @field:[NotNull Size(max = 3)] var codes: String = ""',
          '}',
        ],
        'Pool.java': [
          '@ConfigurationProperties("app.pool")',
          'class PoolProperties { private int min, max = 4; }',
          '@ConfigurationProperties("app.named")',
          'record Named(@Name("custom") String value) {}',
        ],
      }),
    ).toEqual({
      owned: ['app.named', 'app.pool', 'app.retry'],
      exact: [
        'app.named.value',
        'app.pool.max',
        'app.pool.min',
        'app.retry.codes',
        'app.retry.count',
        'app.retry.name',
      ],
      open: ['app.named'],
    });
  });

  it('accepts any key below a @Bean method, a class outside the project or an unknown superclass', () => {
    expect(
      keysOf({
        'Config.java': [
          'class Config {',
          '  @Bean',
          '  @ConfigurationProperties(prefix = "app.datasource")',
          '  HikariDataSource dataSource() { return new HikariDataSource(); }',
          '}',
          '@ConfigurationProperties("app.client")',
          'class ClientProperties extends LibraryProperties { private String url; }',
          '@EnableConfigurationProperties(ClientProperties.class)',
          'class Enabler {}',
          '@ConfigurationProperties',
          'class RootProperties { private String name; }',
        ],
      }),
    ).toEqual({
      owned: ['app.client'],
      exact: ['app.client.url'],
      open: ['app.client', 'app.datasource'],
    });
  });
});
