import { afterEach, describe, expect, it } from 'vitest';
import { project, removeProjects } from '../test-support/spring-config-projects.mjs';
import { sourceTextReader } from '../../reporting/function-locator.mjs';
import { withoutUnconstrainedBodies } from './request-body-constraints.mjs';

const CONTROLLER = 'src/main/java/shop/Api.java';
const CONSTRAINTS = 'import jakarta.validation.constraints.*;\nimport jakarta.validation.Valid;\n';

function controller(parameter, imports = '') {
  return `package shop;\n${imports}\nclass Api {\n  void create(\n      ${parameter}) {}\n}\n`;
}

function reported(parameter, types = {}, imports = '') {
  const files = { [CONTROLLER]: controller(parameter, imports) };
  for (const [name, text] of Object.entries(types)) {
    files[`src/main/java/shop/${name}.java`] = `package shop;\n${CONSTRAINTS}${text}\n`;
  }
  const projectRoot = project(files, { jpa: false });
  const findings = [
    {
      tool: 'pmd',
      rule: 'SpringValidRequestBody',
      path: CONTROLLER,
      location: { line: 5, column: 7 },
    },
  ];
  return (
    withoutUnconstrainedBodies(findings, {
      projectRoot,
      roots: ['src/main/java'],
      readText: sourceTextReader(projectRoot),
    }).length === 1
  );
}

afterEach(removeProjects);

describe('SpringValidRequestBody on the constraints of the body type', () => {
  it('drops a class and a record without constraints', () => {
    expect(
      reported('@RequestBody Plain body', { Plain: '@Data class Plain { String name; }' }),
    ).toBe(false);
    expect(reported('@RequestBody Plain body', { Plain: 'record Plain(String name) {}' })).toBe(
      false,
    );
  });

  it('keeps a type with a field or record component constraint', () => {
    expect(reported('@RequestBody Box body', { Box: 'class Box { @NotBlank String name; }' })).toBe(
      true,
    );
    expect(reported('@RequestBody Box body', { Box: 'record Box(@Min(1) int size) {}' })).toBe(
      true,
    );
  });

  it('reads the constraint of a list element type and of a qualified annotation', () => {
    const box = { Box: 'class Box { @jakarta.validation.constraints.NotNull String name; }' };
    expect(reported('@RequestBody List<Box> body', box)).toBe(true);
  });

  it('keeps a constraint reached through @Valid and drops one that nothing cascades to', () => {
    const line = 'class Line { @NotNull String sku; }';
    expect(
      reported('@RequestBody Order body', {
        Order: 'class Order { @Valid List<Line> lines; }',
        Line: line,
      }),
    ).toBe(true);
    expect(
      reported('@RequestBody Order body', {
        Order: 'class Order { List<Line> lines; }',
        Line: line,
      }),
    ).toBe(false);
  });

  it('keeps a constraint inherited from a project superclass', () => {
    expect(
      reported('@RequestBody Child body', {
        Child: 'class Child extends Base {}',
        Base: 'class Base { @NotNull Long id; }',
      }),
    ).toBe(true);
  });

  it('keeps a custom constraint annotation of the project', () => {
    expect(
      reported('@RequestBody Box body', {
        Box: 'class Box { @Even int size; }',
        Even: 'import jakarta.validation.Constraint;\n@Constraint(validatedBy = EvenValidator.class)\n@interface Even {}',
      }),
    ).toBe(true);
  });

  it('keeps a type from a dependency, an interface and a @Valid field of such a type', () => {
    expect(reported('@RequestBody Registration body')).toBe(true);
    expect(
      reported('@RequestBody Shape body', { Shape: 'interface Shape { String name(); }' }),
    ).toBe(true);
    expect(
      reported('@RequestBody Holder body', {
        Holder: 'class Holder { @Valid external.Thing thing; }',
      }),
    ).toBe(true);
  });

  it('reads a type with annotations and a final modifier before it', () => {
    expect(
      reported('final @RequestBody(required = false) Plain body', {
        Plain: 'class Plain { String name; }',
      }),
    ).toBe(false);
  });

  it('keeps findings of other rules', () => {
    const findings = [{ tool: 'pmd', rule: 'Other', path: CONTROLLER, location: { line: 5 } }];
    expect(
      withoutUnconstrainedBodies(findings, {
        projectRoot: '/nonexistent',
        roots: [],
        readText: () => undefined,
      }),
    ).toEqual(findings);
  });

  it('counts any constraint of the validation packages, listed or not', () => {
    expect(
      reported('@RequestBody Box body', {
        Box: 'import org.hibernate.validator.constraints.time.DurationMin;\nclass Box { @DurationMin(seconds = 1) Duration d; }',
      }),
    ).toBe(true);
    expect(
      reported('@RequestBody Box body', {
        Box: 'import org.hibernate.validator.constraints.*;\n@ScriptAssert(lang = "js", script = "x")\nclass Box {}',
      }),
    ).toBe(true);
    expect(
      reported('@RequestBody Box body', {
        Box: 'import jakarta.validation.constraints.Brand;\nclass Box { @Brand String x; }',
      }),
    ).toBe(true);
  });

  it('does not take an annotation of another package for a constraint under a star import', () => {
    expect(
      reported('@RequestBody Box body', {
        Box: 'import com.fasterxml.jackson.annotation.JsonProperty;\nclass Box { @JsonProperty("a") String x; @Deprecated int y; }',
      }),
    ).toBe(false);
  });
});
