import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readTestOnlyClassFindings } from './test-only-classes.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

const edge = ([source, target]) => `   ${source} -> ${target} not found\n`;

function module(root, qualifier, options) {
  const { classes, main = [], tests = [], published = false } = options;
  const reportRoot = path.join(root, '.reports', qualifier || 'root');
  write(reportRoot, {
    'jdeps-classes.txt': classes.map((name) => `${name}\n`).join(''),
    'jdeps.txt': main.map(edge).join(''),
    'jdeps-test.txt': tests.map(edge).join(''),
    'manifest.json': JSON.stringify({ published }),
  });
  const prefix = qualifier === '' ? '' : `${qualifier}/`;
  return {
    reportRoot,
    qualifier,
    sourceRoots: [`${prefix}src/main/java`],
    kotlinSourceRoots: options.kotlin ? [`${prefix}src/main/kotlin`] : [],
    resourceRoots: options.resourceRoots ?? [`${prefix}src/main/resources`],
  };
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'test-only-classes-'));
  roots.push(root);
  write(root, files);
  return root;
}

const source = (name, body = '') => `package shop;\n\npublic class ${name} {${body}}\n`;

function summary(findings) {
  return findings.map(
    ({ path: file, identity, location }) => `${file}:${location?.line} ${identity}`,
  );
}

describe('readTestOnlyClassFindings', () => {
  it('reports a main class only test classes use, with the exception that lifts it', () => {
    const root = project({
      'src/main/java/shop/Cart.java': source('Cart'),
      'src/main/java/shop/Prices.java': source('Prices'),
      'src/main/java/shop/Fixtures.java': source('Fixtures'),
    });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, '', {
          classes: ['shop.Cart', 'shop.Prices', 'shop.Fixtures', 'shop.Fixtures$Order'],
          main: [
            ['shop.Cart', 'shop.Prices'],
            ['shop.Prices', 'shop.Cart'],
          ],
          tests: [
            ['shop.CartTest', 'shop.Cart'],
            ['shop.CartTest', 'shop.Fixtures$Order'],
          ],
        }),
      ],
    });

    expect(summary(findings)).toEqual(['src/main/java/shop/Fixtures.java:3 class:shop.Fixtures']);
    expect(findings[0].message).toBe(
      'Class shop.Fixtures is only used by tests. Move it to the test sources, or use it from production code. ' +
        'If it is loaded by name from a file nitpicker does not read, or another build uses it, add ' +
        '{"rule":"coupling/test-only-export","paths":["src/main/java/shop/Fixtures.java"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('counts production use from another module and resolves a class to its own module first', () => {
    const root = project({
      'core/src/main/java/shop/Money.java': source('Money'),
      'app/src/main/java/shop/Money.java': source('Money'),
      'app/src/main/java/shop/App.java': source('App'),
    });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, 'core', {
          classes: ['shop.Money'],
          tests: [['shop.MoneyTest', 'shop.Money']],
        }),
        module(root, 'app', {
          classes: ['shop.Money', 'shop.App'],
          main: [['shop.App', 'shop.Money']],
          tests: [['shop.AppTest', 'shop.Money']],
        }),
      ],
    });

    expect(summary(findings)).toEqual(['core/src/main/java/shop/Money.java:3 class:shop.Money']);
  });

  it('spares container-wired classes, entry points and names production text mentions', () => {
    const root = project({
      'src/main/java/shop/Handler.java': source('Handler'),
      'src/main/java/shop/Main.java': source('Main', ' public static void main(String[] args) {} '),
      'src/main/java/shop/Limits.java': source('Limits', ' static final int MAX = 3; '),
      'src/main/java/shop/Cart.java': source('Cart', ' int max() { return Limits.MAX; } '),
      'src/main/java/shop/Appender.java': source('Appender'),
      'src/main/resources/logback.xml': '<appender class="shop.Appender"/>',
    });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, '', {
          classes: ['shop.Handler', 'shop.Main', 'shop.Limits', 'shop.Cart', 'shop.Appender'],
          main: [['shop.Handler', 'org.springframework.stereotype.Component']],
          tests: ['Handler', 'Main', 'Limits', 'Appender'].map((name) => [
            `shop.${name}Test`,
            `shop.${name}`,
          ]),
        }),
      ],
    });

    expect(findings).toEqual([]);
  });

  it("spares a published library's classes that its own or another module's tests use", () => {
    const root = project({
      'lib/src/main/java/shop/Codec.java': source('Codec'),
      'lib/src/main/java/shop/Format.java': source('Format'),
      'app/src/main/java/shop/Main.java': source(
        'Main',
        ' public static void main(String[] a) {} ',
      ),
      'app/src/main/java/shop/Dead.java': source('Dead'),
    });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, 'lib', {
          classes: ['shop.Codec', 'shop.Format'],
          tests: [['shop.CodecTest', 'shop.Codec']],
          published: true,
        }),
        module(root, 'app', {
          classes: ['shop.Main', 'shop.Dead'],
          tests: [
            ['shop.FormatTest', 'shop.Format'],
            ['shop.DeadTest', 'shop.Dead'],
          ],
          published: true,
        }),
      ],
    });

    expect(summary(findings)).toEqual(['app/src/main/java/shop/Dead.java:3 class:shop.Dead']);
  });

  it('counts a published module that starts a Spring Boot application as an application', () => {
    const root = project({ 'src/main/java/shop/Cart.java': source('Cart') });
    const findings = readTestOnlyClassFindings(root, {
      projects: [
        module(root, '', {
          classes: ['shop.App', 'shop.Cart'],
          main: [['shop.App', 'org.springframework.boot.autoconfigure.SpringBootApplication']],
          tests: [['shop.CartTest', 'shop.Cart']],
          published: true,
        }),
      ],
    });

    expect(summary(findings)).toEqual(['src/main/java/shop/Cart.java:3 class:shop.Cart']);
  });

  it('stays silent when a module has no test dependency report', () => {
    const root = project({ 'src/main/java/shop/Cart.java': source('Cart') });
    const complete = module(root, '', { classes: ['shop.Cart'], tests: [['T', 'shop.Cart']] });
    rmSync(path.join(complete.reportRoot, 'jdeps-test.txt'));

    expect(readTestOnlyClassFindings(root, { projects: [complete] })).toEqual([]);
  });
});

const tested = (...names) => names.map((name) => [`shop.${name}Test`, `shop.${name}`]);

function singleModule(files, { classes, main = [], ...options }) {
  const root = project(files);
  const projects = [
    module(root, '', {
      classes,
      main,
      tests: tested(...classes.map((name) => name.slice(5))),
      ...options,
    }),
  ];
  return summary(readTestOnlyClassFindings(root, { projects }));
}

describe('readTestOnlyClassFindings wiring', () => {
  it('spares a class whose project annotation carries a container annotation', () => {
    expect(
      singleModule(
        {
          'src/main/java/shop/Handler.java':
            'package shop;\n\n@Component\npublic @interface Handler {}\n',
          'src/main/java/shop/Pinger.java': source('Pinger'),
          'src/main/java/shop/Marker.java': 'package shop;\n\npublic @interface Marker {}\n',
          'src/main/java/shop/Tagged.java': source('Tagged'),
        },
        {
          classes: ['shop.Pinger', 'shop.Tagged'],
          main: [
            ['shop.Handler', 'java.lang.annotation.Annotation'],
            ['shop.Handler', 'org.springframework.stereotype.Component'],
            ['shop.Marker', 'java.lang.annotation.Annotation'],
            ['shop.Pinger', 'shop.Handler'],
            ['shop.Tagged', 'shop.Marker'],
          ],
        },
      ),
    ).toEqual(['src/main/java/shop/Tagged.java:3 class:shop.Tagged']);
  });

  it.each([
    'org.springframework.boot.actuate.endpoint.annotation.Endpoint',
    'org.springframework.boot.actuate.endpoint.web.annotation.RestControllerEndpoint',
    'org.springframework.cloud.openfeign.FeignClient',
    'jakarta.servlet.annotation.WebServlet',
    'javax.servlet.annotation.WebFilter',
    'jakarta.websocket.server.ServerEndpoint',
    'jakarta.ejb.Stateless',
    'jakarta.enterprise.context.SessionScoped',
    'jakarta.ws.rs.ext.Provider',
    'org.springframework.data.jpa.repository.JpaRepository',
  ])('spares a class that %s wires', (annotation) => {
    expect(
      singleModule(
        { 'src/main/java/shop/Hook.java': source('Hook') },
        { classes: ['shop.Hook'], main: [['shop.Hook', annotation]] },
      ),
    ).toEqual([]);
  });
});

describe('readTestOnlyClassFindings in Kotlin modules', () => {
  it('maps classes to the file that declares them, top-level functions to FileKt, and spares main', () => {
    const kotlin = (name, body) => [`src/main/kotlin/shop/${name}.kt`, `package shop\n\n${body}`];
    expect(
      singleModule(
        Object.fromEntries([
          kotlin('Models', 'class OnlyTested { fun v() = 1 }\ndata class Line(val sku: String)\n'),
          kotlin('Helpers', 'fun helper(): Int = 4\n'),
          kotlin('Cli', 'fun main(args: Array<String>) {}\n'),
          kotlin(
            'Entry',
            'object Entry {\n    @JvmStatic\n    fun main(args: Array<String>) {}\n}\n',
          ),
          [
            'src/main/kotlin/shop/Named.kt',
            '@file:JvmName("Tools")\npackage shop\n\nfun tool() = 1\n',
          ],
        ]),
        {
          classes: [
            'shop.OnlyTested',
            'shop.Line',
            'shop.HelpersKt',
            'shop.CliKt',
            'shop.Entry',
            'shop.Tools',
          ],
          kotlin: true,
        },
      ),
    ).toEqual([
      'src/main/kotlin/shop/Helpers.kt:3 class:shop.HelpersKt',
      'src/main/kotlin/shop/Models.kt:3 class:shop.OnlyTested',
      'src/main/kotlin/shop/Models.kt:4 class:shop.Line',
      'src/main/kotlin/shop/Named.kt:4 class:shop.Tools',
    ]);
  });
});

describe('readTestOnlyClassFindings names outside the sources', () => {
  it('reads the resource roots the build names, not only src/main/resources', () => {
    expect(
      singleModule(
        {
          'src/main/java/shop/Driver.java': source('Driver'),
          'src/main/filtered/app.properties': 'driver=shop.Driver\n',
        },
        { classes: ['shop.Driver'], resourceRoots: ['src/main/filtered'] },
      ),
    ).toEqual([]);
  });

  it('reads build scripts, the webapp folder and config files of the module and the root', () => {
    const root = project({
      'web/src/main/java/shop/HelloServlet.java': source('HelloServlet'),
      'web/src/main/java/shop/Handler.java': source('Handler'),
      'web/src/main/java/shop/Plugin.java': source('Plugin'),
      'web/src/main/java/shop/Worker.java': source('Worker'),
      'web/src/main/java/shop/Documented.java': source('Documented'),
      'web/src/main/webapp/WEB-INF/web.xml': '<servlet-class>shop.HelloServlet</servlet-class>',
      'web/template.yaml': 'Handler: shop.Handler::handleRequest\n',
      'web/build.gradle':
        "gradlePlugin { plugins { p { implementationClass = 'shop.Plugin' } } }\n",
      Dockerfile: 'CMD ["java", "-cp", "app.jar", "shop.Worker"]\n',
      'README.md': 'Fixtures live in shop.Documented.\n',
    });
    const projects = [
      module(root, 'web', {
        classes: [
          'shop.HelloServlet',
          'shop.Handler',
          'shop.Plugin',
          'shop.Worker',
          'shop.Documented',
        ],
        tests: tested('HelloServlet', 'Handler', 'Plugin', 'Worker', 'Documented'),
      }),
    ];

    expect(summary(readTestOnlyClassFindings(root, { projects }))).toEqual([
      'web/src/main/java/shop/Documented.java:3 class:shop.Documented',
    ]);
  });

  it('ignores names in comments, and a longer name that starts with the class name', () => {
    expect(
      singleModule(
        {
          'src/main/java/shop/Helper.java': source('Helper'),
          'src/main/java/shop/Loader.java': source('Loader'),
          'src/main/java/shop/Cart.java': source('Cart'),
          'src/main/java/shop/Other.java':
            'package shop;\n\n/** Wraps the Helper idea, see shop.Cart. */\npublic class Other {\n' +
            '  Object load() throws Exception { return Class.forName("shop.Loader"); }\n' +
            '  String name() { return "Helper"; }\n  String more() { return "shop.CartService"; }\n}\n',
        },
        { classes: ['shop.Helper', 'shop.Loader', 'shop.Cart'] },
      ),
    ).toEqual([
      'src/main/java/shop/Cart.java:3 class:shop.Cart',
      'src/main/java/shop/Helper.java:3 class:shop.Helper',
    ]);
  });
});
