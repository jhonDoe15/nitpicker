import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../test-support/temp-projects.mts';
import { module, source, summary, type Pair } from '../test-support/test-only-modules.mts';
import { readTestOnlyClassFindings } from './test-only-classes.mts';

const project = useTempProjects('nitpicker-framework-dispatch-');

function testOnly(
  files: Readonly<Record<string, string>>,
  options: { readonly classes: readonly string[]; readonly main?: readonly Pair[] },
): string[] {
  const root = project(files);
  const tests = options.classes.map((name): Pair => [`${name}Test`, name]);
  const projects = [module(root, '', { ...options, tests, traits: ['kotlin'] })];
  return summary(readTestOnlyClassFindings(root, { projects }));
}

const controller = (name: string) =>
  `package controllers;\n\npublic class ${name} extends play.mvc.Controller {}\n`;

describe('test-only classes that a framework dispatches without a Java reference', () => {
  it('spares Play controllers that conf/routes names, and reports one it does not name', () => {
    expect(
      testOnly(
        {
          'conf/routes': [
            '# GET /legacy Legacy.show',
            'GET     /orders/{id}     OrderController.show',
            'POST    /admin/users     admin.Users.create',
            'GET     /public/         staticDir:public',
          ].join('\n'),
          'src/main/java/controllers/OrderController.java': controller('OrderController'),
          'src/main/java/controllers/admin/Users.java': controller('Users'),
          'src/main/java/controllers/Legacy.java': controller('Legacy'),
        },
        {
          classes: ['controllers.OrderController', 'controllers.admin.Users', 'controllers.Legacy'],
        },
      ),
    ).toEqual(['src/main/java/controllers/Legacy.java:3 class:controllers.Legacy']);
  });

  it.each([
    ['play.mvc.Controller'],
    ['play.jobs.Job'],
    ['play.jobs.On'],
    ['play.jobs.Every'],
    ['play.jobs.OnApplicationStart'],
    ['io.awspring.cloud.sqs.annotation.SqsListener'],
    ['org.springframework.scheduling.annotation.Scheduled'],
  ])('spares an outer class whose nested class the framework runs through %s', (wiring) => {
    expect(
      testOnly(
        { 'src/main/java/shop/ExpirationJobs.java': source('ExpirationJobs') },
        {
          classes: ['shop.ExpirationJobs', 'shop.ExpirationJobs$TrialJob'],
          main: [['shop.ExpirationJobs$TrialJob', wiring]],
        },
      ),
    ).toEqual([]);
  });

  it('spares subclasses that production code loads by scanning for a supertype', () => {
    const chain = [
      'package shop;',
      'public class ValidationChain {',
      '  void load() {',
      '    for (Class<?> type : Play.classloader.getAssignableClasses(ChainValidator.class)) {}',
      '    ServiceLoader.load(shop.spi.Exporter.class);',
      '  }',
      '}',
    ].join('\n');
    expect(
      testOnly(
        {
          'src/main/java/shop/ValidationChain.java': chain,
          'src/main/java/shop/BaseValidator.java':
            'package shop;\n\npublic abstract class BaseValidator<T>\n    extends ChainValidator {}\n',
          'src/main/java/shop/StockValidator.java':
            'package shop;\n\npublic class StockValidator extends BaseValidator<Stock> {}\n',
          'src/main/java/shop/CsvExporter.java':
            'package shop;\n\npublic final class CsvExporter implements Closeable, Exporter {}\n',
          'src/main/java/shop/Unrelated.java':
            'package shop;\n\npublic class Unrelated extends Validators {}\n',
        },
        { classes: ['shop.StockValidator', 'shop.CsvExporter', 'shop.Unrelated'] },
      ),
    ).toEqual(['src/main/java/shop/Unrelated.java:3 class:shop.Unrelated']);
  });

  it('reads Kotlin, enum, record and nested subtypes of a scanned type', () => {
    const files = {
      'src/main/java/shop/Loader.java':
        'package shop;\nclass Loader { void l() { ServiceLoader.load(Exporter.class); } }\n',
      'src/main/kotlin/shop/Exporters.kt': [
        'package shop',
        'class KotlinExporter : Exporter()',
        'class Plain : Base()',
        'enum class Format : Exporter { CSV }',
      ].join('\n'),
      'src/main/java/shop/Kinds.java':
        'package shop;\npublic enum Kinds implements Exporter { A }\n',
      'src/main/java/shop/Row.java':
        'package shop;\npublic record Row(int a) implements Exporter {}\n',
      'src/main/java/shop/Holder.java':
        'package shop;\npublic class Holder {\n  static class Inner implements Exporter {}\n}\n',
      'src/main/java/shop/Sealed.java':
        'package shop;\npublic sealed class Sealed extends Base permits Exporter {}\n',
    };
    const classes = ['KotlinExporter', 'Plain', 'Format', 'Kinds', 'Row', 'Holder', 'Sealed'];

    expect(testOnly(files, { classes: classes.map((name) => `shop.${name}`) })).toEqual([
      'src/main/java/shop/Sealed.java:2 class:shop.Sealed',
      'src/main/kotlin/shop/Exporters.kt:3 class:shop.Plain',
    ]);
  });

  it('ignores a commented-out route', () => {
    expect(
      testOnly(
        {
          'conf/routes': '# GET /legacy controllers.Legacy.show\n',
          'src/main/java/controllers/Legacy.java': controller('Legacy'),
        },
        { classes: ['controllers.Legacy'] },
      ),
    ).toEqual(['src/main/java/controllers/Legacy.java:3 class:controllers.Legacy']);
  });

  it('does not count a scan or a routes entry in test code', () => {
    const root = project({
      'src/main/java/controllers/Reports.java': controller('Reports'),
      'src/test/resources/routes': 'GET /reports Reports.index\n',
      'src/test/java/shop/ScanTest.java':
        'class ScanTest { void t() { ServiceLoader.load(Reports.class); } }\n',
    });
    const projects = [
      module(root, '', {
        classes: ['controllers.Reports'],
        tests: [['controllers.ReportsTest', 'controllers.Reports']],
      }),
    ];

    expect(summary(readTestOnlyClassFindings(root, { projects }))).toEqual([
      'src/main/java/controllers/Reports.java:3 class:controllers.Reports',
    ]);
  });
});
