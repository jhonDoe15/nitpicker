//! NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT: an `equals(Object)` that dereferences its argument on every path,
//! so `equals(null)` throws instead of answering `false`.
//!
//! As measured, the argument counts as dereferenced as it does for the null patterns, through casts, copies
//! and calls that dereference it, but locking on it in the method itself does not count. At a test of it (or of a
//! copy), only the way a null argument takes counts; see the engine README for what else ends it. Reported on the
//! line of the first statement, high priority when the class or the method is final.
use super::super::{Context, names, nulls, place};
use crate::engine::source::named_children;
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub const PATTERN: &str = "NP_EQUALS_SHOULD_HANDLE_NULL_ARGUMENT";

fn takes_object(context: &Context, method: Node) -> bool {
    let (erased, _, _) = context.resolver.parameters(method.child_by_field_name("parameters"));
    matches!(erased.as_slice(), [Type::Class(name, _)] if name == "java.lang.Object")
}

fn first_statement(body: Node) -> Option<Node> {
    named_children(body).into_iter().find(|statement| {
        let declared_only = statement.kind() == "local_variable_declaration"
            && named_children(*statement).iter().filter(|part| part.kind() == "variable_declarator").all(|part| part.child_by_field_name("value").is_none());
        !statement.kind().ends_with("comment") && !declared_only
    })
}

pub fn equals_null<'a>(context: &Context<'a>, own: &str, method: Node<'a>) {
    let named = method.child_by_field_name("name").map(|name| context.text(name));
    if named != Some("equals") || has_modifier(method, "static") || !takes_object(context, method) {
        return;
    }
    let Some(body) = method.child_by_field_name("body") else { return };
    if nulls::dereferenced_parameters(context, own, method, false) & 1 == 0 {
        return;
    }
    let Some(first) = first_statement(body) else { return };
    let label = names::method(context, own, method, None);
    let fixed = |class: Node| class.kind() == "record_declaration" || (class.kind() == "class_declaration" && has_modifier(class, "final"));
    let holder = method.parent().and_then(|body| body.parent());
    let priority = if has_modifier(method, "final") || holder.is_some_and(fixed) { 1 } else { 2 };
    let parameter = method.child_by_field_name("parameters").and_then(|list| named_children(list).into_iter().find(|part| part.kind() == "formal_parameter"));
    let name = parameter.and_then(|parameter| parameter.child_by_field_name("name")).map_or("?", |name| context.text(name));
    let message = format!("{label} does not check for null argument");
    let place = place::variable(&label, name);
    context.report_listed(PATTERN, first, context.line(first), message, place, priority, vec![label]);
}
