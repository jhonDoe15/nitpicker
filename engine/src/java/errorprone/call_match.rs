//! Error Prone's method matchers on a class: the receiver type is the qualifier's type, or the declaring class without a qualifier.
use super::Context;
use tree_sitter::Node;

fn owner_of(context: &Context, call: Node, is_static: bool) -> Option<String> {
    let resolved = context.resolver.resolve_call(call).filter(|resolved| resolved.method.is_static == is_static)?;
    Some(if call.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring })
}

/// `staticMethod().onClass(owner).namedAnyOf(names)`.
pub fn static_on_class(context: &Context, call: Node, owner: &str, names: &[&str]) -> bool {
    call.kind() == "method_invocation"
        && call.child_by_field_name("name").is_some_and(|name| names.contains(&context.text(name)))
        && owner_of(context, call, true).is_some_and(|found| found == owner)
}

/// `instanceMethod().onExactClass(owner).namedAnyOf(names)`.
pub fn instance_on_exact_class(context: &Context, call: Node, owner: &str, names: &[&str]) -> bool {
    call.kind() == "method_invocation"
        && call.child_by_field_name("name").is_some_and(|name| names.contains(&context.text(name)))
        && owner_of(context, call, false).is_some_and(|found| found == owner)
}
