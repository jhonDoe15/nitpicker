//! `integration-test-uses-approved-harness`: an integration test (the `integration` setting, a file under
//! `<test root>/integration/`) that never calls an approved harness function or subprocess, reported on the program.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_runtime::production_runtime::first_token;

const RULE: &str = "integration-test-uses-approved-harness";
const DEFAULT_APPROVED_FUNCTIONS: [&str; 1] = ["startApp"];
const DEFAULT_APPROVED_SUBPROCESSES: [&str; 1] = ["AppProcess"];

fn approved(context: &Context, key: &str, fallback: &[&str]) -> Vec<String> {
    let given: Option<Vec<String>> = context.setting(&format!("{RULE}.{key}")).and_then(|json| serde_json::from_str(json).ok()).flatten();
    given.unwrap_or_else(|| fallback.iter().map(|name| name.to_string()).collect())
}

fn imported_name(specifier: Node) -> Option<String> {
    let imported = specifier.node("imported")?;
    let name = if imported.is("Identifier") { imported.name() } else { imported.text("value") };
    name.map(|name| name.into_owned())
}

fn is_named_in(node: Option<Node>, names: &[String]) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().is_some_and(|name| names.iter().any(|bound| *bound == name)))
}

fn is_approved_harness_call(call: Node, functions: &[String], subprocesses: &[String]) -> bool {
    let Some(callee) = call.node("callee") else { return false };
    if callee.is("Identifier") {
        return is_named_in(Some(callee), functions);
    }
    let property = callee.node("property").filter(|property| property.is("Identifier"));
    callee.is("MemberExpression")
        && !callee.flag("computed")
        && is_named_in(callee.node("object"), subprocesses)
        && property.is_some_and(|property| matches!(property.name().as_deref(), Some("start" | "run")))
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    if context.setting(&format!("{RULE}.integration")) != Some("true") {
        return;
    }
    let approved_functions = approved(context, "approved-functions", &DEFAULT_APPROVED_FUNCTIONS);
    let approved_subprocesses = approved(context, "approved-subprocesses", &DEFAULT_APPROVED_SUBPROCESSES);
    let mut functions: Vec<String> = Vec::new();
    let mut subprocesses: Vec<String> = Vec::new();
    for node in view.nodes() {
        if node.is("ImportDeclaration") {
            for specifier in node.nodes("specifiers").into_iter().filter(|specifier| specifier.is("ImportSpecifier")) {
                let (Some(imported), Some(local)) = (imported_name(specifier), specifier.node("local").and_then(|local| local.name())) else { continue };
                if approved_functions.contains(&imported) {
                    functions.push(local.to_string());
                }
                if approved_subprocesses.contains(&imported) {
                    subprocesses.push(local.into_owned());
                }
            }
        }
        if node.is("CallExpression") && is_approved_harness_call(node, &functions, &subprocesses) {
            return;
        }
    }
    let start = first_token(context.file.text) as u32;
    context.report_range(RULE, start, Some(context.file.text.len() as u32), "Exercise the application through an approved integration-test harness.".to_string());
}
