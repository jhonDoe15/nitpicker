import { afterEach, describe, expect, it } from 'vitest';
import { scratchProjects } from './test-support/unbound-project.mjs';

const JAVA_TEST = 'src/test/java/shop/ShopTest.java';
const KOTLIN_TEST = 'src/test/kotlin/shop/ShopTest.kt';

const projects = scratchProjects();
const { problemsIn } = projects;

afterEach(projects.remove);

function keysIn(file, lines) {
  return problemsIn({ [file]: lines.join('\n') }).map((problem) => problem.split(' binds')[0]);
}

describe('spring/unbound-property in Java test overrides', () => {
  it('reads properties of @SpringBootTest, slice tests and @TestPropertySource', () => {
    expect(
      keysIn(JAVA_TEST, [
        '@SpringBootTest(webEnvironment = RANDOM_PORT, properties = {"server.prot=0", "server.port=0"})',
        '@DataJpaTest(properties = "spring.datasource.user=sa")',
        '@TestPropertySource(locations = "classpath:x.properties", properties = {',
        '    "spring.datasource.passwrd: secret",',
        '    "spring.datasource.url=" + URL })',
        '@SpringBootTest({"server.adress=::1"})',
        '@SpringBootTest(value = "server.portt 1")',
        '@WebMvcTest(controllers = ShopController.class)',
        '@ParameterizedTest(name = "server.prot={0}")',
        'class ShopTest {}',
      ]),
    ).toEqual([
      `${JAVA_TEST}:1 server.prot`,
      `${JAVA_TEST}:2 spring.datasource.user`,
      `${JAVA_TEST}:4 spring.datasource.passwrd`,
      `${JAVA_TEST}:6 server.adress`,
      `${JAVA_TEST}:7 server.portt`,
    ]);
  });

  it('reads TestPropertyValues, withPropertyValues and DynamicPropertyRegistry.add', () => {
    expect(
      keysIn(JAVA_TEST, [
        'class ShopTest {',
        '  void values(ConfigurableApplicationContext context) {',
        '    TestPropertyValues.of("server.prot=1").and("server.adress=x").applyTo(context);',
        '    runner.withPropertyValues("spring.datasource.user=sa", "server.port=1");',
        '  }',
        '  @DynamicPropertySource',
        '  static void registry(DynamicPropertyRegistry registry) {',
        '    registry.add("spring.datasource.passwrd", () -> "x");',
        '    registry.add("spring.datasource.password", () -> "x");',
        '    other.add("server.portt", 1);',
        '  }',
        '}',
      ]),
    ).toEqual([
      `${JAVA_TEST}:3 server.prot`,
      `${JAVA_TEST}:3 server.adress`,
      `${JAVA_TEST}:4 spring.datasource.user`,
      `${JAVA_TEST}:8 spring.datasource.passwrd`,
    ]);
  });

  it('ignores comments and keys built at run time', () => {
    expect(
      keysIn(JAVA_TEST, [
        '// @SpringBootTest(properties = "server.prot=0")',
        '/* runner.withPropertyValues("server.prot=0") */',
        '@SpringBootTest(properties = KEYS)',
        'class ShopTest {',
        '  void values() { runner.withPropertyValues(PREFIX + "prot=1"); }',
        '}',
      ]),
    ).toEqual([]);
  });
});

describe('spring/unbound-property in Kotlin test overrides', () => {
  it('reads array and vararg properties, withPropertyValues and the registry parameter', () => {
    expect(
      keysIn(KOTLIN_TEST, [
        '@SpringBootTest(properties = ["server.prot=0", "server.port=0"])',
        '@SpringBootTest("server.adress=::1", "server.address=::1")',
        '@TestPropertySource(properties = ["spring.datasource.user=sa"])',
        'class ShopTest {',
        '  fun runner() = runner.withPropertyValues("server.portt=1", "server.port=${port}")',
        '  companion object {',
        '    @DynamicPropertySource @JvmStatic',
        '    fun props(registry: DynamicPropertyRegistry) {',
        '      registry.add("spring.datasource.passwrd") { "x" }',
        '      registry.add("${prefix}.url") { "x" }',
        '    }',
        '  }',
        '}',
      ]),
    ).toEqual([
      `${KOTLIN_TEST}:1 server.prot`,
      `${KOTLIN_TEST}:2 server.adress`,
      `${KOTLIN_TEST}:3 spring.datasource.user`,
      `${KOTLIN_TEST}:5 server.portt`,
      `${KOTLIN_TEST}:9 spring.datasource.passwrd`,
    ]);
  });
});
