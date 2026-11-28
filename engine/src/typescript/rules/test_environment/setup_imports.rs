//! `no-production-imports-in-setup-files`: each import, re-export, `import()` and `require()` of a module in a test
//! setup file. Whether the module is production code depends on the project layout, so each candidate carries a
//! `production-module` condition for the caller to answer.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;

const RULE: &str = "no-production-imports-in-setup-files";
const CONDITION: &str = "production-module";

fn required_source(node: Node) -> Option<Node> {
    let callee = node.node("callee")?;
    let is_require = callee.is("Identifier") && callee.name().as_deref() == Some("require");
    if is_require { node.list("arguments").first().copied().flatten() } else { None }
}

fn module_source(node: Node) -> Option<Node> {
    match node.kind() {
        "ImportDeclaration" | "ExportAllDeclaration" | "ExportNamedDeclaration" | "ImportExpression" => node.node("source"),
        "CallExpression" => required_source(node),
        _ => None,
    }
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let found: Vec<(u32, u32, String)> =
        view.nodes().filter_map(|node| string_literal(module_source(node)).map(|source| (node.start(), node.end(), source))).collect();
    for (start, end, source) in found {
        let message = format!(
            "A setup file runs before every test file, so production code imported here is covered without a test. Import {source} in the tests that need it."
        );
        context.report_when(RULE, start, Some(end), message, vec![(CONDITION.into(), source)]);
    }
}
