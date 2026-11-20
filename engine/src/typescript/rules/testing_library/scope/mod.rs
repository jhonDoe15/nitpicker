//! Which test files the preset gives to the testing-library rules, and the module each one takes its testing
//! utilities from: `reactTestScope` of the preset's `react-test-files`, which follows the file's imports.
mod mocks;

use super::nodes::string_literal;
use crate::typescript::resolve::{Limits, Modules};
use crate::typescript::rules::support::view::Node;
use std::path::Path;
use std::sync::OnceLock;

const LIMITS: Limits = Limits { depth: 4, files: 50 };
const TEST_UTILS: &str = "test-utils";

static END_TO_END_ROOT: OnceLock<String> = OnceLock::new();

/// Names the folder of browser tests, which are no component tests whatever their extension.
pub fn set_end_to_end_root(root: String) {
    let _ = END_TO_END_ROOT.set(root);
}

pub struct Scope {
    pub inside: bool,
    pub utils_module: Option<String>,
}

fn under(source: &str, package: &str) -> bool {
    source.strip_prefix(package).is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
}

fn in_testing_library(source: &str) -> bool {
    source.strip_prefix("@testing-library/").is_some_and(|rest| !rest.is_empty())
}

fn is_react_package(source: &str) -> bool {
    let name = source.split('/').next().unwrap_or_default();
    name == "react" || name.strip_prefix("react-").is_some_and(|rest| !rest.is_empty())
}

fn is_project_test_utils(source: &str) -> bool {
    (source.starts_with("./") || source.starts_with("../")) && source.rsplit('/').next().is_some_and(|last| last.contains(TEST_UTILS))
}

fn is_react_test_module(source: &str) -> bool {
    in_testing_library(source) || is_react_package(source) || under(source, "enzyme") || is_project_test_utils(source)
}

fn is_testing_library_module(source: &str) -> bool {
    in_testing_library(source) || under(source, "enzyme") || under(source, "react-test-renderer")
}

fn is_query_module(source: &str) -> bool {
    in_testing_library(source) && source != "@testing-library/user-event" && !under(source, "@testing-library/jest-dom")
}

fn is_browser_test_module(source: &str) -> bool {
    source.starts_with("@playwright/") || under(source, "cypress")
}

fn is_component_file(path: &str) -> bool {
    [".jsx", ".tsx", ".cjsx", ".mjsx", ".ctsx", ".mtsx"].iter().any(|ending| path.ends_with(ending))
}

fn module_name(file: &Path) -> String {
    let base = file.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let base = base.rsplit_once('.').map_or(base.clone(), |(before, _)| before.to_string());
    if base == "index" { file.parent().and_then(Path::file_name).map(|name| name.to_string_lossy().into_owned()).unwrap_or_default() } else { base }
}

fn is_test_helper(modules: &Modules, file: &Path) -> bool {
    module_name(file).contains(TEST_UTILS) || modules.sources(file).iter().any(|source| is_testing_library_module(source))
}

/// `moduleSourceOf`: the module a statement or a top-level expression loads.
fn module_source(node: Node) -> Option<String> {
    match node.kind() {
        "ImportDeclaration" | "ImportExpression" | "ExportNamedDeclaration" | "ExportAllDeclaration" => string_literal(node.node("source")),
        "TSImportEqualsDeclaration" => {
            string_literal(node.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference")).and_then(|reference| reference.node("expression")))
        }
        "CallExpression" => mocks::required(Some(node)),
        _ => None,
    }
}

fn top_level_expressions(statement: Node) -> Vec<Node> {
    match statement.kind() {
        "ExpressionStatement" => statement.node("expression").into_iter().collect(),
        "VariableDeclaration" => statement.nodes("declarations").into_iter().filter_map(|declarator| declarator.node("init")).collect(),
        _ => Vec::new(),
    }
}

fn awaited(node: Node) -> Option<Node> {
    if node.is("AwaitExpression") { node.node("argument") } else { Some(node) }
}

/// `topLevelSources`: what the file imports, requires or mocks at its top level.
fn top_level_sources(program: Node) -> Vec<String> {
    let apis = mocks::Apis::of(program);
    let mut sources = Vec::new();
    for statement in program.nodes("body") {
        let expressions = top_level_expressions(statement);
        sources.extend(std::iter::once(statement).chain(expressions.iter().copied()).filter_map(module_source));
        let calls = expressions.iter().filter_map(|expression| awaited(*expression)).filter(|node| node.is("CallExpression"));
        sources.extend(calls.flat_map(|call| apis.mocked(call)).flatten());
    }
    sources
}

/// `display` is the path from the project root, with forward slashes.
pub fn of(program: Node, path: &str, display: &str) -> Scope {
    let sources = top_level_sources(program);
    let file = Path::new(path);
    let modules = Modules::shared();
    let reaches_helper = |source: &&String| modules.reaches(file, std::slice::from_ref(*source), LIMITS, |reached| is_test_helper(modules, reached));
    let helper = if file.is_absolute() { sources.iter().filter(|source| !is_react_test_module(source)).find(reaches_helper) } else { None };
    let end_to_end = END_TO_END_ROOT.get().is_some_and(|root| display.strip_prefix(root.as_str()).is_some_and(|rest| rest.starts_with('/')));
    let component = is_component_file(path) && !(end_to_end || sources.iter().any(|source| is_browser_test_module(source)));
    let direct = sources.iter().any(|source| is_query_module(source));
    Scope {
        inside: component || helper.is_some() || sources.iter().any(|source| is_react_test_module(source)),
        utils_module: if direct { None } else { helper.cloned() },
    }
}
