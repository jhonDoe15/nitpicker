//! Integration tests for layout- and config-aware TypeScript lint rules:
//! - `nitpicker/report-module-load-effects`
//! - `nitpicker/test-must-use-production-runtime`
//! - `nitpicker/no-copied-constant`
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Debug, PartialEq, Eq)]
struct FindingRow {
    file: String,
    rule: String,
    line: u64,
    column: u64,
    message: String,
    end_line: Option<u64>,
    end_column: Option<u64>,
}

struct TempProject {
    root: PathBuf,
}

impl TempProject {
    fn new(tag: &str) -> Self {
        static COUNTER: AtomicUsize = AtomicUsize::new(0);
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "nitpicker-engine-{tag}-{}-{id}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("create temp dir");
        Self { root }
    }

    fn write(&self, rel: &str, content: &str) -> PathBuf {
        let full = self.root.join(rel);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).expect("create parent dirs");
        }
        std::fs::write(&full, content).expect("write file");
        full
    }

    fn lint(
        &self,
        rules: &str,
        files: &[&str],
        config: Option<serde_json::Value>,
    ) -> Vec<FindingRow> {
        let list_file = self.root.join("_files.tsv");
        let lines: Vec<String> = files
            .iter()
            .map(|rel| format!("{}\t{rel}", self.root.join(rel).display()))
            .collect();
        std::fs::write(&list_file, lines.join("\n")).expect("write list");

        let mut cmd = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
        cmd.args(["typescript-lint", "--rules", rules, "--files"]).arg(&list_file);

        if let Some(cfg) = config {
            let cfg_file = self.root.join("_config.json");
            std::fs::write(&cfg_file, serde_json::to_string(&cfg).expect("json")).expect("write cfg");
            cmd.arg("--config").arg(&cfg_file);
        }

        let output = cmd.output().expect("engine runs");
        assert!(
            output.status.success(),
            "engine failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let rows: Vec<Vec<serde_json::Value>> =
            serde_json::from_slice(&output.stdout).expect("parse json");
        rows.into_iter()
            .map(|row| FindingRow {
                file: row[0].as_str().expect("file").to_string(),
                rule: row[1].as_str().expect("rule").to_string(),
                line: row[2].as_u64().expect("line"),
                column: row[3].as_u64().expect("column"),
                message: row[4].as_str().expect("message").to_string(),
                end_line: row.get(5).and_then(|v| v.as_u64()),
                end_column: row.get(6).and_then(|v| v.as_u64()),
            })
            .collect()
    }
}

impl Drop for TempProject {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn root_config(root: &Path, extra_rules: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "projectRoot": root.to_string_lossy(),
        "rules": extra_rules,
    })
}

// =============================================================================
// 1. report-module-load-effects
// =============================================================================

#[test]
fn report_module_load_effects_styles_and_core_messages() {
    let project = TempProject::new("rmle-styles");
    let valid_styles = [
        "import './index.css';",
        "import './theme.scss';",
        "import './theme.sass';",
        "import './theme.less';",
        "import './theme.styl';",
        "import './theme.pcss';",
        "import '../styles/global.css';",
        "import 'normalize.css';",
        "import './index.css?inline';",
        "import styles from './panel.module.css';",
        "export { styles };",
    ]
    .join("\n");
    project.write("src/styles.ts", &valid_styles);
    let clean = project.lint("report-module-load-effects", &["src/styles.ts"], None);
    assert_eq!(clean, vec![]);

    let invalid = [
        "import './polyfill.js';",
        "import 'reflect-metadata';",
        "import './css';",
        "import './index.css.js';",
        "import './x.cssx';",
        "initialize();",
        "if (enabled()) { initialize(); }",
        "await initialize();",
        "export class Registry { static { initialize(); } }",
        "export const startedAt = new Date();",
        "const now = Date.now();",
    ]
    .join("\n");
    project.write("src/bootstrap.ts", &invalid);
    let findings = project.lint("report-module-load-effects", &["src/bootstrap.ts"], None);

    let hint = " Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx, and the NestJS entry in nest-cli.json) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.";

    assert_eq!(findings.len(), 11);
    for row in &findings {
        assert_eq!(row.rule, "nitpicker/report-module-load-effects");
        assert!(row.end_line.is_some() && row.end_column.is_some());
    }
    assert_eq!(findings[0].line, 1);
    assert_eq!(findings[0].column, 1);
    assert_eq!(findings[0].end_line, Some(1));
    assert_eq!(findings[0].end_column, Some(24));
    assert_eq!(
        findings[0].message,
        format!("Side-effect-only import executes code during module loading.{hint}")
    );
    assert_eq!(
        findings[5].message,
        format!("Top-level expression executes work during module loading.{hint}")
    );
    assert_eq!(
        findings[6].message,
        format!("Top-level IfStatement executes control flow during module loading.{hint}")
    );
    assert_eq!(
        findings[7].message,
        format!("Top-level await delays and executes work during module loading.{hint}")
    );
    assert_eq!(
        findings[8].message,
        "Static initialization block executes during module loading."
    );
    assert_eq!(
        findings[9].message,
        "`new Date()` runs when the module is imported. Move it into a function and call that from the composition root, passing the result in. An exception fits only when it must run at import."
    );
    assert_eq!(
        findings[10].message,
        "`Date.now()` runs when the module is imported. Move it into a function and call that from the composition root, passing the result in. An exception fits only when it must run at import."
    );
}

#[test]
fn report_module_load_effects_main_guards() {
    let project = TempProject::new("rmle-guards");
    let valid_cases = [
        "if (import.meta.main) { await main(process.argv.slice(2)); }",
        "import { pathToFileURL } from 'node:url'; if (import.meta.url === pathToFileURL(process.argv[1]).href) { await run(); }",
        "import { pathToFileURL } from 'node:url'; import { realpathSync } from 'node:fs'; if (pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) { await run(); }",
        "import { pathToFileURL } from 'url'; if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) { for (const name of names) { await check(name); } }",
        "if (require.main === module) { run(); }",
        "if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) { run(); }",
        "import process from 'node:process'; if (import.meta.url === process.argv[1]) { await run(); }",
    ];
    let mut valid_files = Vec::new();
    for (idx, code) in valid_cases.iter().enumerate() {
        let rel = format!("scripts/valid_{idx}.mjs");
        project.write(&rel, code);
        valid_files.push(rel);
    }
    let refs: Vec<&str> = valid_files.iter().map(String::as_str).collect();
    assert_eq!(project.lint("report-module-load-effects", &refs, None), vec![]);

    let invalid_cases = [
        ("if (import.meta.env.DEV) { await connect(); }", 2),
        ("if (import.meta.main) { await run(); } else { await other(); }", 3),
        ("if (import.meta.url) { await connect(); }", 2),
        ("if (require.main) { await connect(); }", 2),
        ("const require = { main: 1 }, module = 1; if (require.main === module) { fetch('x'); }", 1),
        ("const process = { argv: [0, import.meta.url] }; if (import.meta.url === process.argv[1]) { fetch('x'); }", 1),
        ("import { pathToFileURL } from './url.mjs'; if (import.meta.url === pathToFileURL(process.argv[1]).href) { fetch('x'); }", 1),
    ];
    for (idx, (code, expected_count)) in invalid_cases.iter().enumerate() {
        let rel = format!("scripts/invalid_{idx}.mjs");
        project.write(&rel, code);
        let found = project.lint("report-module-load-effects", &[&rel], None);
        assert_eq!(found.len(), *expected_count, "case {idx}: {code}\nfound: {found:?}");
    }
}

#[test]
fn report_module_load_effects_member_definitions_and_commonjs_option() {
    let project = TempProject::new("rmle-defs");
    let valid_defs = [
        "'use strict';\nfunction Document(model) { this.model = model; }\nDocument.prototype.update = function update(args) { return this.model.update(args); };",
        "function Shape() {}\nShape.prototype = { constructor: Shape, area() { return 0; }, sides: 0 };",
        "function Shape() {}\nShape.prototype[Symbol.iterator] = function* iterate() {};",
        "function Shape() {}\nObject.assign(Shape.prototype, { area() { return 0; } });",
        "function Shape() {}\nObject.defineProperty(Shape.prototype, 'area', { get() { return 0; }, enumerable: true });",
        "var app = exports = module.exports = {};\napp.init = function init() { this.cache = {}; };",
        "var req = Object.create(require('http').IncomingMessage.prototype);\nreq.get = function get() {};",
    ];
    for (idx, code) in valid_defs.iter().enumerate() {
        let rel = format!("lib/valid_def_{idx}.js");
        project.write(&rel, code);
        let found = project.lint("report-module-load-effects", &[&rel], None);
        assert_eq!(found, vec![], "valid def {idx}: {code}");
    }

    let invalid_defs = [
        "Array.prototype.last = function last() { return this[this.length - 1]; };",
        "function Shape() {}\nShape.prototype.area = compute();",
        "function Shape() {}\nShape.prototype[key()] = function area() { return 0; };",
        "function Shape() {}\nShape.prototype.area += 1;",
        "function Shape() {}\nObject.assign(Other.prototype, { area() { return 0; } });",
        "const app = express();\napp.get = function get() {};",
    ];
    for (idx, code) in invalid_defs.iter().enumerate() {
        let rel = format!("lib/invalid_def_{idx}.js");
        project.write(&rel, code);
        let found = project.lint("report-module-load-effects", &[&rel], None);
        assert_eq!(found.len(), 1, "invalid def {idx}: {code}");
    }

    // commonJsExports option
    project.write("lib/cjs.js", "module.exports = { ok: true };\nexports.helper = () => 1;\n");
    let without_opt = project.lint("report-module-load-effects", &["lib/cjs.js"], None);
    assert_eq!(without_opt.len(), 2);

    let cfg = root_config(
        &project.root,
        serde_json::json!({ "report-module-load-effects": { "commonJsExports": true } }),
    );
    let with_opt = project.lint("report-module-load-effects", &["lib/cjs.js"], Some(cfg));
    assert_eq!(with_opt, vec![]);
}

#[test]
fn report_module_load_effects_node_sync_imports() {
    let project = TempProject::new("rmle-sync");
    project.write(
        "src/config.ts",
        "import { readFileSync } from 'node:fs';\nexport const data = readFileSync('a.txt', 'utf8');\n",
    );
    let found = project.lint("report-module-load-effects", &["src/config.ts"], None);
    assert_eq!(found.len(), 1);
    assert!(found[0].message.starts_with("`readFileSync()` runs when the module is imported."));
}

// =============================================================================
// 2. test-must-use-production-runtime
// =============================================================================

#[test]
fn test_must_use_production_runtime_direct_helpers_and_exemptions() {
    let project = TempProject::new("tmupr-main");
    project.write(
        "tsconfig.json",
        r#"{"compilerOptions":{"types":[],"lib":["ES2022"],"paths":{"@/*":["./src/*"]}}}"#,
    );
    project.write("src/main/ui/app.tsx", "export function App() { return null; }\n");
    project.write("src/main/feature/feature.ts", "export function execute() { return 1; }\n");
    project.write(
        "test/support/render-app.tsx",
        "import { App } from '../../src/main/ui/app.js';\nexport function renderApp() { return App(); }\n",
    );
    project.write("test/support/reexport.ts", "export { App } from '../../src/main/ui/app.js';\n");
    project.write("test/support/chain.ts", "export * from './reexport.js';\n");
    project.write(
        "test/support/aliased.tsx",
        "import { App } from '@/main/ui/app.js';\nexport function renderApp() { return App(); }\n",
    );
    project.write(
        "test/support/library-only.tsx",
        "export function renderApp() { return null; }\n",
    );
    project.write(
        "test/support/type-only.tsx",
        "import type { App } from '../../src/main/ui/app.js';\nexport type A = typeof App;\n",
    );
    project.write(
        "test/support/inline-type.tsx",
        "import { type App } from '../../src/main/ui/app.js';\nexport type A = typeof App;\n",
    );

    // Valid tests
    project.write(
        "src/main/feature/__tests__/feature.test.ts",
        "import { execute } from '../feature.js'; execute();\n",
    );
    project.write(
        "tests/contract/schema.test.ts",
        "import { describe } from 'vitest'; describe('schema', () => {});\n",
    );
    project.write("tests/url.test.ts", "import { parseURL } from '../src'; parseURL('/');\n");
    project.write(
        "test/ui/via-helper.test.tsx",
        "import { renderApp } from '../support/render-app'; renderApp();\n",
    );
    project.write(
        "test/ui/via-chain.test.tsx",
        "import { App } from '../support/chain.js'; App();\n",
    );
    project.write(
        "test/ui/via-alias.test.tsx",
        "import { renderApp } from '../support/aliased.js'; renderApp();\n",
    );
    project.write(
        "e2e/login.spec.ts",
        "import { test } from '@playwright/test'; test('login', async () => {});\n",
    );
    project.write(
        "tests/checkout.cy.test.ts",
        "import { mount } from 'cypress/react'; mount(null);\n",
    );
    project.write(
        "test/support/stdout.ts",
        "import { vi } from 'vitest'; export function captureStdout() { return vi; }\n",
    );

    let cfg = root_config(&project.root, serde_json::json!({}));
    let valid_files = [
        "src/main/feature/__tests__/feature.test.ts",
        "tests/contract/schema.test.ts",
        "tests/url.test.ts",
        "test/ui/via-helper.test.tsx",
        "test/ui/via-chain.test.tsx",
        "test/ui/via-alias.test.tsx",
        "e2e/login.spec.ts",
        "tests/checkout.cy.test.ts",
        "test/support/stdout.ts",
    ];
    assert_eq!(
        project.lint("test-must-use-production-runtime", &valid_files, Some(cfg.clone())),
        vec![]
    );

    // Invalid tests
    project.write(
        "test/ui/type-only.test.tsx",
        "import type { App } from '../../src/main/ui/app.js';\nexport type X = typeof App;\n",
    );
    project.write(
        "test/ui/lib-helper.test.tsx",
        "import { renderApp } from '../support/library-only.js'; renderApp();\n",
    );
    project.write(
        "test/ui/type-helper.test.tsx",
        "import { type A } from '../support/type-only.js'; export type B = A;\n",
    );
    project.write(
        "test/ui/inline-type-helper.test.tsx",
        "import { type A } from '../support/inline-type.js'; export type B = A;\n",
    );
    project.write(
        "tests/greet.test.cjs",
        "const path = require('node:path'); path.join('a');\n",
    );
    project.write(
        "test/e2e/not-playwright.spec.ts",
        "import { expect } from 'vitest'; expect(1).toBe(1);\n",
    );

    let invalid_files = [
        "test/ui/type-only.test.tsx",
        "test/ui/lib-helper.test.tsx",
        "test/ui/type-helper.test.tsx",
        "test/ui/inline-type-helper.test.tsx",
        "tests/greet.test.cjs",
        "test/e2e/not-playwright.spec.ts",
    ];
    let findings = project.lint("test-must-use-production-runtime", &invalid_files, Some(cfg));
    assert_eq!(findings.len(), invalid_files.len());
    for row in &findings {
        assert_eq!(row.rule, "nitpicker/test-must-use-production-runtime");
        assert_eq!(row.line, 1);
        assert_eq!(row.column, 1);
        assert!(row.end_line.is_some() && row.end_column.is_some());
        assert_eq!(
            row.message,
            "This test imports no production code at runtime (only types, libraries, or helpers that import none). Import the code under test from the source root, directly or through a helper such as a render function that imports it. Shared helpers belong in a file not named *.test.* or *.spec.*."
        );
    }
}

#[test]
fn test_must_use_production_runtime_multi_root_and_runner_options() {
    let project = TempProject::new("tmupr-multi");
    project.write("packages/api/src/server.ts", "export function serve() { return 200; }\n");
    project.write(
        "packages/api/test/server.test.ts",
        "import { serve } from '../src/server.js'; serve();\n",
    );
    project.write(
        "packages/api/test/empty.test.ts",
        "import { describe } from 'vitest'; describe('empty', () => {});\n",
    );
    project.write(
        "packages/api/fixtures/unit/fixture.test.ts",
        "import { describe } from 'vitest'; describe('fixture', () => {});\n",
    );

    let cfg = serde_json::json!({
        "projectRoot": project.root.to_string_lossy(),
        "layout": {
            "sourceRoots": ["packages/api/src", "packages/web/src"],
            "testRoots": ["packages/api/test", "integration"]
        },
        "rules": {
            "nitpicker/test-must-use-production-runtime": {
                "runner": "jest",
                "exemptPattern": "/packages/api/fixtures/"
            }
        }
    });

    let findings = project.lint(
        "nitpicker/test-must-use-production-runtime",
        &[
            "packages/api/test/server.test.ts",
            "packages/api/test/empty.test.ts",
            "packages/api/fixtures/unit/fixture.test.ts",
        ],
        Some(cfg),
    );
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].file, "packages/api/test/empty.test.ts");
    assert!(
        findings[0]
            .message
            .ends_with("Shared helpers belong in a file Jest does not run as a test: not named *.test.* or *.spec.*, not under __tests__, and outside the testMatch or testRegex of the Jest config.")
    );
}

// =============================================================================
// 3. no-copied-constant
// =============================================================================

fn setup_copied_constants_project(tag: &str) -> TempProject {
    let project = TempProject::new(tag);
    project.write(
        "tsconfig.json",
        r#"{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]},"types":[],"lib":["ES2022"]}}"#,
    );
    project.write(
        "src/limits.ts",
        &[
            "export const MAX_ITEMS = 50;",
            "export const DEFAULT_REGION = 'eu-west-1' as const;",
            "export const MIN_BALANCE = -25;",
            "export const RETRY_LIMIT = 2;",
            "export const SHORT = 'ab';",
            "const PAGE_SIZE = 20;",
            "const hidden = 77;",
            "export { PAGE_SIZE, hidden };",
            "export const maxDepth = 9;",
            "export const TIMEOUT_MS = 5_000;",
            "export const LIMITS = { MAX: 3 };",
            "export function limit() { return MAX_ITEMS; }",
        ]
        .join("\n"),
    );
    project.write(
        "src/index.ts",
        "export * from './limits';\nexport { ROLE as ADMIN_ROLE } from './roles';\nexport { Paging as Pages } from './paging';\n",
    );
    project.write(
        "src/settings.ts",
        "class Settings { static readonly THEME_NAME = 'dark-blue'; }\nexport { Settings as default };\n",
    );
    project.write(
        "src/legacy.js",
        "export class Legacy {\n  static MAX_RETRIES = 30;\n  static #HIDDEN_CAP = 31;\n}\n",
    );
    project.write("src/roles.ts", "export const ROLE = 'administrator';\n");
    project.write("src/other.ts", "export const OTHER_LIMIT = 50;\n");
    project.write("src/same.ts", "export const BATCH_SIZE = 50;\n");
    project.write(
        "src/paging.ts",
        &[
            "export class Paging {",
            "  static readonly PAGE_LIMIT = 40;",
            "  private static readonly SECRET_KEY = 'hidden-key';",
            "  static readonly lowerName = 41;",
            "  static PAGE_FLOOR = 42;",
            "  readonly PAGE_CEILING = 43;",
            "}",
            "class Local { static readonly LOCAL_KEY = 'local-key'; }",
            "export { Local as Shared };",
        ]
        .join("\n"),
    );
    project.write(
        "src/barrel/index.ts",
        "export * from './constants';\nexport * from './colors';\n",
    );
    project.write(
        "src/barrel/constants.ts",
        "export const MAX_ZOOM = 30;\nexport const SCROLL_TIMEOUT = 100;\n",
    );
    project.write(
        "src/barrel/colors.ts",
        "export const PALETTE_SIZE = 7;\nexport const rgbToHex = (r: number) => String(r);\nexport { MAX_ZOOM as ZOOM } from './constants';\n",
    );
    project.write("test/helpers/values.ts", "export const HELPER_LIMIT = 123;\n");
    project
}

#[test]
fn no_copied_constant_reports_numbers_strings_barrels_and_multi_owners() {
    let project = setup_copied_constants_project("ncc-core");
    let cfg = root_config(&project.root, serde_json::json!({}));

    project.write(
        "test/basic.test.ts",
        &[
            "import { limit } from '../src/limits';",
            "it('caps the cart', () => {",
            "  expect(limit()).toBe(50);",
            "  expect(region()).toBe('eu-west-1');",
            "});",
        ]
        .join("\n"),
    );
    let basic = project.lint("no-copied-constant", &["test/basic.test.ts"], Some(cfg.clone()));
    assert_eq!(basic.len(), 2);
    assert_eq!(basic[0].rule, "nitpicker/no-copied-constant");
    assert_eq!(basic[0].line, 3);
    assert_eq!(basic[0].column, 24);
    assert_eq!(basic[0].end_line, Some(3));
    assert_eq!(basic[0].end_column, Some(26));
    assert_eq!(
        basic[0].message,
        "This literal copies MAX_ITEMS from ../src/limits: when MAX_ITEMS changes, the test keeps checking the old value or stops testing the case it was written for. Use MAX_ITEMS (or an expression on it, such as MAX_ITEMS + 1). If the value is a contract the test pins on purpose, assert it next to the constant: expect(MAX_ITEMS).toBe(50)."
    );
    assert_eq!(basic[1].line, 4);
    assert_eq!(
        basic[1].message,
        "This literal copies DEFAULT_REGION from ../src/limits: when DEFAULT_REGION changes, the test keeps checking the old value or stops testing the case it was written for. Use DEFAULT_REGION (or build the text from it). If the value is a contract the test pins on purpose, assert it next to the constant: expect(DEFAULT_REGION).toBe(\"eu-west-1\")."
    );

    // Negative numbers, separators, export lists, barrels, aliased re-exports
    project.write(
        "test/barrel.test.ts",
        &[
            "import * as api from '@/index';",
            "expect(balance()).toBe(-25);",
            "expect(timeout()).toBe(5000);",
            "expect(page()).toHaveLength(20);",
            "expect(role()).toBe('administrator');",
        ]
        .join("\n"),
    );
    let barrel = project.lint("no-copied-constant", &["test/barrel.test.ts"], Some(cfg.clone()));
    let prefixes: Vec<&str> = barrel.iter().map(|r| r.message.split(" from ").next().unwrap()).collect();
    assert_eq!(
        prefixes,
        vec![
            "This literal copies MIN_BALANCE",
            "This literal copies TIMEOUT_MS",
            "This literal copies PAGE_SIZE",
            "This literal copies ADMIN_ROLE",
        ]
    );

    // Multiple constants and multiple owners
    project.write(
        "test/multi.test.ts",
        &[
            "import { limit } from '../src/limits';",
            "import { OTHER_LIMIT } from '../src/other';",
            "import '../src/same';",
            "it('works', () => { expect(limit()).toBe(50); });",
        ]
        .join("\n"),
    );
    let multi = project.lint("no-copied-constant", &["test/multi.test.ts"], Some(cfg));
    assert_eq!(multi.len(), 1);
    assert_eq!(
        multi[0].message,
        "This literal copies BATCH_SIZE (and MAX_ITEMS, OTHER_LIMIT, which hold the same value) from ../src/limits and ../src/other and ../src/same: when BATCH_SIZE changes, the test keeps checking the old value or stops testing the case it was written for. Use BATCH_SIZE (or an expression on it, such as BATCH_SIZE + 1). If the value is a contract the test pins on purpose, assert it next to the constant: expect(BATCH_SIZE).toBe(50)."
    );
}

#[test]
fn no_copied_constant_skips_pins_trivial_positions_and_helpers() {
    let project = setup_copied_constants_project("ncc-skips");
    let cfg = root_config(&project.root, serde_json::json!({}));

    project.write(
        "test/skips.test.ts",
        &[
            "import { MAX_ITEMS, limit as cap } from '../src/limits';",
            "import * as limits from '../src/limits';",
            "import type { Role } from '../src/roles';",
            "import { HELPER_LIMIT } from './helpers/values';",
            "describe('eu-west-1', () => {",
            "  it('administrator', () => { expect(MAX_ITEMS).toBe(50); });",
            "  test('50', () => expect(limits.MAX_ITEMS).toEqual(50));",
            "  expect(retries()).toBe(2);",
            "  expect(code()).toBe('ab');",
            "  expect(depth()).toBe(9);",
            "  expect(hidden()).toBe(77);",
            "  expect(items()).toBe(3);",
            "  expect(helper()).toBe(123);",
            "  const options = { 'eu-west-1': true };",
            "  type Region = 'eu-west-1';",
            "  vi.mock('eu-west-1');",
            "  expect(cap()).toBe(`${MAX_ITEMS}`);",
            "});",
        ]
        .join("\n"),
    );
    assert_eq!(
        project.lint("no-copied-constant", &["test/skips.test.ts"], Some(cfg.clone())),
        vec![]
    );

    project.write("src/limits.test.ts", "export const LOCAL_LIMIT = 321;\n");
    project.write(
        "src/other.test.ts",
        "import './limits.test';\nimport '../test/helpers/values';\nexpect(a()).toBe(321);\nexpect(b()).toBe(123);\n",
    );
    assert_eq!(project.lint("no-copied-constant", &["src/other.test.ts"], Some(cfg)), vec![]);
}

#[test]
fn no_copied_constant_loads_classes_and_barrel_scoping() {
    let project = setup_copied_constants_project("ncc-advanced");
    let cfg = root_config(&project.root, serde_json::json!({}));

    // require, dynamic import, import = require, importActual, requireActual
    project.write(
        "test/loads.test.ts",
        &[
            "const { limit } = require('../src/limits');",
            "import roles = require('../src/roles');",
            "it('loads late', async () => {",
            "  const { BATCH_SIZE: size } = await import('../src/same');",
            "  expect(limit()).toBe(-25);",
            "  expect(roles.role()).toBe('administrator');",
            "  expect(size).toBe(50);",
            "  expect(count()).toBe(50);",
            "  const other = await vi.importActual('../src/other');",
            "  const read = jest.requireActual('node:fs');",
            "  const dynamic = await import(`../src/${name}`);",
            "});",
        ]
        .join("\n"),
    );
    let loads = project.lint("no-copied-constant", &["test/loads.test.ts"], Some(cfg.clone()));
    let summary: Vec<String> = loads
        .iter()
        .map(|r| format!("{} {}", r.line, r.message.split(':').next().unwrap()))
        .collect();
    assert_eq!(
        summary,
        vec![
            "5 This literal copies MIN_BALANCE from ../src/limits",
            "6 This literal copies ROLE from ../src/roles",
            "8 This literal copies BATCH_SIZE (and MAX_ITEMS, OTHER_LIMIT, which hold the same value) from ../src/limits and ../src/other and ../src/same",
        ]
    );

    // Static readonly members, JS static members, default-exported class, shadowed require
    project.write(
        "test/classes.test.ts",
        &[
            "import { Paging as P, Shared } from '../src/paging';",
            "import { Legacy } from '../src/legacy.js';",
            "import { Pages } from '@/index';",
            "import Theme from '../src/settings';",
            "expect(pages()).toBe(40);",
            "expect(P.PAGE_LIMIT).toBe(40);",
            "expect(new P().size()).toBe(40);",
            "expect(key()).toBe('hidden-key');",
            "expect(other()).toEqual([41, 42, 43]);",
            "expect(Shared.name).toBe('local-key');",
            "expect(retries()).toBe(30);",
            "expect(cap()).toBe(31);",
            "expect(Theme.current()).toBe('dark-blue');",
            "function require(name) { return name; }",
            "require('../src/limits');",
            "expect(limit()).toBe(50);",
        ]
        .join("\n"),
    );
    let classes = project.lint("no-copied-constant", &["test/classes.test.ts"], Some(cfg.clone()));
    let class_summary: Vec<String> = classes
        .iter()
        .map(|r| format!("{} {}", r.line, r.message.split(" from ").next().unwrap()))
        .collect();
    assert_eq!(
        class_summary,
        vec![
            "5 This literal copies Pages.PAGE_LIMIT (and Paging.PAGE_LIMIT, which hold the same value)",
            "7 This literal copies Pages.PAGE_LIMIT (and Paging.PAGE_LIMIT, which hold the same value)",
            "10 This literal copies Shared.LOCAL_KEY",
            "11 This literal copies Legacy.MAX_RETRIES",
            "13 This literal copies Settings.THEME_NAME",
        ]
    );

    // Barrel scoping: only defining module of imported symbol
    project.write(
        "test/barrel-scope.test.ts",
        &[
            "import { rgbToHex } from '../src/barrel';",
            "expect(rgbToHex(30)).toBe('30');",
            "expect(rgbToHex(100)).toBe('100');",
            "expect(rgbToHex(7)).toBe('7');",
        ]
        .join("\n"),
    );
    let scoped = project.lint("no-copied-constant", &["test/barrel-scope.test.ts"], Some(cfg));
    assert_eq!(scoped.len(), 1);
    assert_eq!(scoped[0].line, 4);
    assert!(scoped[0].message.starts_with("This literal copies PALETTE_SIZE"));
}

#[test]
fn no_copied_constant_respects_multi_root_layout() {
    let project = TempProject::new("ncc-multi-root");
    project.write("packages/core/src/limits.ts", "export const MAX_RETRIES = 42;\n");
    project.write("packages/core/test/helpers.ts", "export const FAKE_RETRIES = 99;\n");
    project.write(
        "packages/core/test/limits.test.ts",
        &[
            "import '../src/limits';",
            "import './helpers';",
            "expect(retries()).toBe(42);",
            "expect(fake()).toBe(99);",
        ]
        .join("\n"),
    );

    let cfg = serde_json::json!({
        "projectRoot": project.root.to_string_lossy(),
        "layout": {
            "sourceRoots": ["packages/core/src", "packages/web/src"],
            "testRoots": ["packages/core/test", "packages/web/test"]
        }
    });
    let findings = project.lint(
        "no-copied-constant",
        &["packages/core/test/limits.test.ts"],
        Some(cfg),
    );
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].line, 3);
    assert!(findings[0].message.starts_with("This literal copies MAX_RETRIES from ../src/limits:"));
}
