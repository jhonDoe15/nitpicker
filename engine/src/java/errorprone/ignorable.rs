//! UnnecessarilyUsedValue: the result of an ignorable API captured into an `unused` variable.
use super::Context;
use super::fixes::Fix;
use tree_sitter::Node;

const MESSAGE: &str = "The result of this API is ignorable, so it does not need to be captured / assigned into an `unused` variable.";

fn unused_name(name: &str) -> bool {
    name.strip_prefix("unused").is_some_and(|rest| rest.bytes().all(|byte| byte.is_ascii_digit()))
}

fn ignorable(context: &Context, call: Node) -> bool {
    if !matches!(call.kind(), "method_invocation" | "object_creation_expression") {
        return false;
    }
    let Some((resolved, _)) = context.resolver.call_formals(call) else { return false };
    resolved.method.detail.annotations.iter().any(|name| name.rsplit(['.', '$']).next() == Some("CanIgnoreReturnValue"))
}

pub fn unnecessarily_used_value(context: &Context, node: Node) {
    match node.kind() {
        "assignment_expression" => {
            let (Some(left), Some(operator), Some(value)) = (node.child_by_field_name("left"), node.child_by_field_name("operator"), node.child_by_field_name("right")) else { return };
            if context.text(operator) != "=" || left.kind() != "identifier" || !unused_name(context.text(left)) || !ignorable(context, value) {
                return;
            }
            let fix = Fix::replace(node.start_byte(), node.end_byte(), context.text(value));
            context.report_fixed("UnnecessarilyUsedValue", node, operator.start_byte(), MESSAGE, &[fix]);
        }
        "local_variable_declaration" | "field_declaration" => {
            let declarators = crate::java::helpers::declarators(node);
            for (at, declarator) in declarators.iter().enumerate() {
                let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { continue };
                if !unused_name(context.text(name)) || !ignorable(context, value) {
                    continue;
                }
                let in_for = crate::engine::source::parent(node).is_some_and(|holder| holder.kind() == "for_statement");
                let last = if in_for { declarator.end_byte() } else { node.end_byte() };
                let mut end = if at + 1 < declarators.len() { declarator.end_byte() } else { last };
                if context.file.text[end..].starts_with(',') {
                    end += 1;
                }
                let fix = Fix::replace(node.start_byte(), end, format!("{};", context.text(value)));
                context.report_fixed("UnnecessarilyUsedValue", node, name.start_byte(), MESSAGE, &[fix]);
            }
        }
        _ => {}
    }
}
