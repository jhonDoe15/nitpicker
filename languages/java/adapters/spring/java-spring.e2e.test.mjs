import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INIT_SCRIPT } from "../../builds/java-build.mjs";
import { readErrorProneFindings } from "../errorprone/java-errorprone.mjs";
import { codeSmellRules } from "../test-support/code-smell-rules.mjs";
import {
  expectedViolations,
  reportedViolations,
} from "../test-support/violation-markers.mjs";

const enabled = process.env.NITPICKER_JAVA_E2E === "1";
const gradle = process.env.NITPICKER_GRADLE ?? "gradle";
const fixtures = path.join(import.meta.dirname, "..", "fixtures");
const SPRING_RULE = /^(?:Spring|Jpa)/;
const GRADLE_TIMEOUT = 15 * 60 * 1000;
const HOOK_TIMEOUT = 16 * 60 * 1000;
const CHECKSTYLE_VERSION = /<checkstyle version="([^"]+)">/;

function gradleProject(fixtureName) {
  const project = { root: "" };
  beforeAll(() => {
    project.root = path.join(
      mkdtempSync(path.join(tmpdir(), "nitpicker-e2e-")),
      fixtureName,
    );
    cpSync(path.join(fixtures, fixtureName), project.root, { recursive: true });
    const result = spawnSync(
      gradle,
      [
        "--console=plain",
        "--quiet",
        "-I",
        INIT_SCRIPT,
        "nitpickerPmd",
        "nitpickerJava",
      ],
      { cwd: project.root, encoding: "utf8", timeout: GRADLE_TIMEOUT },
    );
    if (result.status !== 0) {
      throw new Error(`Gradle failed: ${result.stderr}`);
    }
  }, HOOK_TIMEOUT);
  afterAll(() => {
    if (project.root !== "") {
      rmSync(path.dirname(project.root), { recursive: true, force: true });
    }
  });
  return project;
}

function markedViolations(projectRoot, sourceSet, isCheckedRule) {
  const sourceRoot = path.join(projectRoot, "src", sourceSet, "java");
  const sarif = path.join(projectRoot, "build", "nitpicker", "pmd.sarif");
  return {
    reported: reportedViolations(sarif, sourceRoot, isCheckedRule),
    expected: expectedViolations(sourceRoot),
  };
}

describe.skipIf(!enabled)("Spring rules on a Spring project", () => {
  const project = gradleProject("spring-project");

  it("reports exactly the violations marked in the fixture sources", () => {
    const { reported, expected } = markedViolations(
      project.root,
      "main",
      (rule) => SPRING_RULE.test(rule) || rule === "IoCallInLoop",
    );
    expect(reported).toEqual(expected);
  });

  it("reports each Spring Data write or flush in a loop or stream callback once", () => {
    const linesOf = (rule) =>
      markedViolations(
        project.root,
        "main",
        (reported) => reported === rule,
      ).reported.map((violation) => violation.split(" ")[0]);
    const spring = [
      ...linesOf("SpringDataNoSaveInLoop"),
      ...linesOf("SpringDataNoFlush"),
    ];
    const loops = linesOf("IoCallInLoop");
    expect({
      spring: spring.length,
      loops: loops.length,
      twice: loops.filter((line) => spring.includes(line)),
    }).toEqual({ spring: 6, loops: 3, twice: [] });
  });

  it("runs the pinned Checkstyle with the bundled config even when the project declares its own", () => {
    const report = readFileSync(
      path.join(project.root, "build", "nitpicker", "checkstyle.xml"),
      "utf8",
    );
    expect(CHECKSTYLE_VERSION.exec(report)?.[1]).toBe("10.21.1");
  });

  it("reports no FieldCanBeFinal in JPA entities and no utility-class finding on configuration classes", () => {
    const findings = readErrorProneFindings({
      reportRoot: path.join(project.root, "build", "nitpicker"),
      roots: [project.root],
      lintedRoots: ["src/main/java", "src/test/java"],
    });
    expect(
      findings.map(
        ({ rule, path: file, location }) => `${file}:${location.line} ${rule}`,
      ),
    ).toEqual([
      "src/main/java/shop/catalog/ProductRepository.java:11 MissingOverride",
    ]);
  });

  it("records the resource roots and that the project uses Spring", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(project.root, "build", "nitpicker", "manifest.json"),
        "utf8",
      ),
    );
    expect({
      spring: manifest.spring,
      resourceRoots: manifest.resourceRoots,
    }).toEqual({
      spring: true,
      resourceRoots: ["src/main/resources"],
    });
  });
});

describe.skipIf(!enabled)("code smell rules on a Gradle project", () => {
  const project = gradleProject("code-smells-project");
  const checkedRules = new Set([
    ...codeSmellRules().map(({ name }) => name),
    "AvoidDuplicateLiterals",
  ]);

  it.each(["main", "test"])(
    "reports exactly the violations marked in %s sources",
    (sourceSet) => {
      const { reported, expected } = markedViolations(
        project.root,
        sourceSet,
        (rule) => checkedRules.has(rule),
      );
      expect(reported).toEqual(expected);
    },
  );
});
