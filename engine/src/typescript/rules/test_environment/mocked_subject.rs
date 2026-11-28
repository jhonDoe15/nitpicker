//! `no-mocking-subject-under-test`: a module mock of a module the test file imports at runtime. Whether that module
//! is production code depends on the project layout, so each candidate carries a `production-subject` condition.
use crate::typescript::rules::Context;
use crate::typescript::rules::test_runtime::production_runtime::is_runtime_import;
use crate::typescript::rules::test_runtime::runner_apis::{Apis, module_mocks};
use crate::typescript::rules::testing_library::nodes::string_literal;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

const RULE: &str = "no-mocking-subject-under-test";
const CONDITION: &str = "production-subject";
static INFRASTRUCTURE_SEAM: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:^|[/.-])(?:fixtures?|infrastructure|seams?)(?:[/.-]|$)").expect("seam pattern"));

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut apis = Apis::new();
    let mut imported: HashSet<String> = HashSet::new();
    let mut mocks: Vec<(u32, u32, String)> = Vec::new();
    for node in view.nodes() {
        apis.observe(node);
        if node.is("ImportDeclaration") {
            let source = string_literal(node.node("source")).filter(|source| is_runtime_import(node) && !INFRASTRUCTURE_SEAM.is_match(source));
            imported.extend(source);
        } else if node.is("CallExpression") {
            mocks.extend(module_mocks(&apis, node).into_iter().flatten().map(|name| (node.start(), node.end(), name)));
        }
    }
    for (start, end, source) in mocks.into_iter().filter(|(_, _, source)| imported.contains(source)) {
        let message = format!("Do not mock the production subject {source}.");
        context.report_when(RULE, start, Some(end), message, vec![(CONDITION.into(), source)]);
    }
}
