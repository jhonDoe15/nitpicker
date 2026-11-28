//! `test-must-use-production-runtime`: a runner test file must import production code at runtime.
//!
//! The verdict is a combination over every import, so the engine lists them all as questions for the caller: the file
//! is reported only when none of its runtime imports reaches production code (one `not-production-runtime` question
//! each) and none of its module sources is a browser test library (one `not-browser-test-module` question each).
//! Whether the file is exempt by its path or the `exemptPattern` option arrives as the `exempt` setting.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;

const RULE: &str = "test-must-use-production-runtime";
const PRODUCTION: &str = "not-production-runtime";
const BROWSER: &str = "not-browser-test-module";
const DEFAULT_HELPER_FILE: &str = "a file the test runner does not run as a test";

pub fn is_runtime_import(node: Node) -> bool {
    if node.text("importKind").as_deref() == Some("type") {
        return false;
    }
    let specifiers = node.nodes("specifiers");
    specifiers.is_empty()
        || specifiers.iter().any(|specifier| !specifier.is("ImportSpecifier") || specifier.text("importKind").as_deref() != Some("type"))
}

fn required_source(node: Node) -> Option<String> {
    let callee = node.node("callee")?;
    if !(callee.is("Identifier") && callee.name().as_deref() == Some("require")) {
        return None;
    }
    string_literal(node.nodes("arguments").first().copied())
}

/// `moduleSourceOf`.
fn module_source(node: Node) -> Option<String> {
    match node.kind() {
        "ImportDeclaration" | "ImportExpression" | "ExportNamedDeclaration" | "ExportAllDeclaration" => string_literal(node.node("source")),
        "TSImportEqualsDeclaration" => {
            let reference = node.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"))?;
            string_literal(reference.node("expression"))
        }
        "CallExpression" => required_source(node),
        _ => None,
    }
}

/// `statementSources` of every statement of the program.
fn statement_sources(program: Node) -> Vec<String> {
    let mut sources = Vec::new();
    for statement in program.nodes("body") {
        let mut inner = Vec::new();
        if statement.is("ExpressionStatement") {
            inner.extend(statement.node("expression"));
        }
        if statement.is("VariableDeclaration") {
            inner.extend(statement.nodes("declarations").into_iter().filter_map(|declarator| declarator.node("init")));
        }
        sources.extend(std::iter::once(statement).chain(inner).filter_map(module_source));
    }
    sources
}

fn runtime_sources(context: &Context) -> Vec<String> {
    let Some((view, _)) = context.estree else { return Vec::new() };
    view.nodes()
        .filter_map(|node| match node.kind() {
            "ImportDeclaration" => is_runtime_import(node).then(|| string_literal(node.node("source"))).flatten(),
            "ImportExpression" => string_literal(node.node("source")),
            "CallExpression" => required_source(node),
            _ => None,
        })
        .collect()
}

/// Where typescript-estree starts the program: at its first token, after white space, comments and a hashbang.
pub fn first_token(text: &str) -> usize {
    let mut at = if text.starts_with("#!") { text.find(['\n', '\r', '\u{2028}', '\u{2029}']).unwrap_or(text.len()) } else { 0 };
    loop {
        let rest = &text[at..];
        let Some(next) = rest.chars().next() else { return at };
        if next.is_whitespace() || next == '\u{FEFF}' || next == '\u{200B}' {
            at += next.len_utf8();
        } else if rest.starts_with("//") {
            at += rest.find(['\n', '\r', '\u{2028}', '\u{2029}']).unwrap_or(rest.len());
        } else if rest.starts_with("/*") {
            at += rest[2..].find("*/").map_or(rest.len(), |close| close + 4);
        } else {
            return at;
        }
    }
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    if context.setting(&format!("{RULE}.exempt")) == Some("true") {
        return;
    }
    let mut conditions: Vec<(String, String)> = Vec::new();
    let asked = runtime_sources(context).into_iter().map(|source| (PRODUCTION, source));
    let browsers = statement_sources(view.program()).into_iter().map(|source| (BROWSER, source));
    for (kind, source) in asked.chain(browsers) {
        if !conditions.iter().any(|(known, value)| known == kind && *value == source) {
            conditions.push((kind.to_string(), source));
        }
    }
    let helper = context.setting(&format!("{RULE}.helper-file")).unwrap_or(DEFAULT_HELPER_FILE);
    let message = format!("This test imports no production code at runtime (only types, libraries, or helpers that import none). Import the code under test from the source root, directly or through a helper such as a render function that imports it. Shared helpers belong in {helper}.");
    let start = first_token(context.file.text) as u32;
    context.report_when(RULE, start, Some(context.file.text.len() as u32), message, conditions);
}
