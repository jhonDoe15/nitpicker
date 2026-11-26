//! The class a method matcher looks at: the receiver's type, or the declaring class without a receiver.
use super::Context;
use tree_sitter::Node;

/// The class the call is made on, for an instance or a static method.
pub fn receiver_name(context: &Context, call: Node, is_static: bool) -> Option<String> {
    let resolved = context.resolver.resolve_call(call).filter(|resolved| resolved.method.is_static == is_static)?;
    Some(if call.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring })
}

/// Whether the class is one of the classes or below one of them.
pub fn is_descendant(context: &Context, name: &str, classes: &[&str]) -> bool {
    classes.iter().any(|class| context.resolver.index.is_subtype(name, class))
}
