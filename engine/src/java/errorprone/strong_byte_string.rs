//! StronglyTypeByteString: a byte array field that is only used to construct `ByteString`s.
use super::call_match::static_on_class;
use super::strong_time::{strongly_type, Strong};
use super::Context;
use crate::engine::source::parent;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn byte_array(context: &Context, declaration: Node, declarator: Node) -> Option<String> {
    match context.resolver.declared_type(declaration, Some(declarator)) {
        Some(Type::Array(element)) if *element == Type::Primitive("byte") => Some("byte[]".to_string()),
        _ => None,
    }
}

fn byte_string_factory<'t>(context: &Context, usage: Node<'t>) -> Option<(Node<'t>, String, String)> {
    let call = parent(usage).filter(|holder| holder.kind() == "argument_list").and_then(parent).filter(|call| call.kind() == "method_invocation")?;
    if !static_on_class(context, call, "com.google.protobuf.ByteString", &["copyFrom"]) {
        return None;
    }
    let (resolved, _) = context.resolver.call_formals(call)?;
    if resolved.method.parameters != [Type::Array(Box::new(Type::Primitive("byte")))] {
        return None;
    }
    Some((call, "com.google.protobuf.ByteString#copyFrom".to_string(), "com.google.protobuf.ByteString".to_string()))
}

fn same_name(name: &str) -> String {
    name.to_string()
}

pub fn strongly_type_byte_string(context: &Context, root: Node) {
    strongly_type(context, root, &Strong { check: "StronglyTypeByteString", replaces: byte_array, factory: byte_string_factory, rename: same_name });
}
