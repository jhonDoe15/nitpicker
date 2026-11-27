use super::test_calls::{callback_owner, enclosing_function, is_suite_call};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};

const RULE: &str = "no-shared-test-state";

fn declares_shared_state(declaration: Node) -> bool {
    let Some(owner) = enclosing_function(declaration) else { return true };
    let call = callback_owner(Some(owner));
    call.is_some_and(is_suite_call) && owner.node("body").is_some() && owner.node("body") == declaration.parent()
}

fn is_top_level_or_suite_level(declaration: Node) -> bool {
    let Some(parent) = declaration.parent() else { return false };
    parent.is("Program") || parent.is("ExportNamedDeclaration") || (parent.is("BlockStatement") && declares_shared_state(declaration))
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("VariableDeclaration")) {
        if node.text("kind").as_deref() != Some("let") || !is_top_level_or_suite_level(node) {
            continue;
        }
        for declarator in node.nodes("declarations") {
            let id = declarator.node("id").filter(|id| id.is("Identifier"));
            if declarator.get("init") == Value::Null {
                continue;
            }
            if let Some(id) = id {
                let message = format!(
                    "Shared mutable state makes tests depend on their order. Keep `{}` inside the test, or declare it without a value and set it in `beforeEach`.",
                    id.name().unwrap_or_default()
                );
                found.push((declarator.start(), declarator.end(), message));
            }
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
