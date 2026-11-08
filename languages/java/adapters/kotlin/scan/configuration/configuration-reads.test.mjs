import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { configurationReads } from './configuration-reads.mjs';

function found(source) {
  const scanned = scanKotlinSource(source);
  return configurationReads(scanned).map(({ rule, offset }) => [rule, lineOf(scanned, offset)]);
}

function inService(line) {
  return found(`package demo\n\nclass Service {\n    ${line}\n}\n`);
}

const RULE = 'ConfigurationReadOutsideCompositionRoot';

describe('configurationReads', () => {
  it.each([
    ['an application property', 'fun mode() = System.getProperty("shop.mode")'],
    ['a property with a default', 'fun mode() = System.getProperty("shop.mode", "live")'],
    ['a property named by a variable', 'fun read(key: String) = System.getProperty(key)'],
    ['a qualified System', 'fun mode() = java.lang.System.getProperty("shop.mode")'],
    ['a reference', 'fun read(keys: List<String>) = keys.map(System::getProperty)'],
    ['Integer.getInteger', 'val batch = Integer.getInteger("shop.batch", 50)'],
    ['java.lang.Long.getLong', 'val timeout = java.lang.Long.getLong("shop.timeout", 30L)'],
    ['java.lang.Boolean.getBoolean', 'val debug = java.lang.Boolean.getBoolean("shop.debug")'],
    ['a template key', 'fun mode(name: String) = System.getProperty("java.$name")'],
  ])('flags %s', (_name, line) => {
    expect(inService(line)).toEqual([[RULE, 4]]);
  });

  it.each([
    ['a JVM property', 'fun version() = System.getProperty("java.version")'],
    ['the user home', 'fun home() = System.getProperty("user.home")'],
    ['a proxy setting', 'fun proxy() = System.getProperty("https.proxyHost")'],
    ['a SOCKS setting', 'fun socks() = System.getProperty("socksProxyHost")'],
    ['text in a string', 'val hint = "call System.getProperty(\\"shop.mode\\")"'],
    ['a comment', '// System.getProperty("shop.mode")'],
    ['a project method', 'fun mode(settings: Settings) = settings.getProperty("shop.mode")'],
    ['the environment, which detekt reports', 'fun region() = System.getenv("REGION")'],
  ])('accepts %s', (_name, line) => {
    expect(inService(line)).toEqual([]);
  });

  it.each([
    ['fun main', 'fun main() {\n    start(System.getProperty("shop.mode"))\n}\n'],
    [
      'a static main in an object',
      'object Cli {\n    @JvmStatic\n    fun main(args: Array<String>) = start(Integer.getInteger("shop.port"))\n}\n',
    ],
    [
      'a Ktor module',
      'fun Application.module() {\n    start(System.getProperty("shop.mode"))\n}\n',
    ],
    [
      'a Micronaut factory',
      'import io.micronaut.context.annotation.Factory\n\n@Factory\nclass Wiring {\n    fun mode() = System.getProperty("shop.mode")\n}\n',
    ],
    [
      'a Dagger module',
      'import dagger.Module\n\n@Module\nobject Wiring {\n    fun port() = Integer.getInteger("shop.port")\n}\n',
    ],
    [
      'a Guice module',
      'import com.google.inject.AbstractModule\n\nclass Wiring : AbstractModule() {\n    fun mode() = System.getProperty("shop.mode")\n}\n',
    ],
    [
      'a CDI producer',
      'import jakarta.enterprise.inject.Produces\n\nclass Wiring {\n    @Produces\n    fun mode() = System.getProperty("shop.mode")\n}\n',
    ],
    [
      'a Quarkus application',
      'import io.quarkus.runtime.QuarkusApplication\n\nclass Entry : QuarkusApplication {\n    override fun run(vararg args: String) = Integer.getInteger("shop.exit", 0)\n}\n',
    ],
    [
      'a Spring configuration class',
      'import org.springframework.context.annotation.Configuration\n\n@Configuration\nclass Wiring {\n    fun mode() = System.getProperty("shop.mode")\n}\n',
    ],
  ])('lets %s read configuration', (_name, body) => {
    expect(found(`package demo\n\n${body}`)).toEqual([]);
  });

  it('still flags a file that only names a framework type in a string or comment', () => {
    expect(
      found(
        'package demo\n\n// like a dagger.Module\nval hint = "io.micronaut.context.annotation.Factory"\nfun mode() = System.getProperty("shop.mode")\n',
      ),
    ).toEqual([[RULE, 5]]);
  });
});
