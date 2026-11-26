//! AvoidValueSetter.
use super::fixes::Fix;
use super::nodes::position;
use super::statics::qualify_class;
use super::timeunit::integer_value;
use super::Context;
use crate::engine::source::named_children;
use tree_sitter::Node;

const MESSAGE_BUILDER: &str = "com.google.protobuf.Message.Builder";
const MESSAGE_ENUM: &str = "com.google.protobuf.ProtocolMessageEnum";

fn upper_underscore(name: &str) -> String {
    let mut out = String::new();
    for (at, part) in name.chars().enumerate() {
        if at > 0 && part.is_ascii_uppercase() {
            out.push('_');
        }
        out.push(part.to_ascii_uppercase());
    }
    out
}

pub fn avoid_value_setter(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !node.child_by_field_name("name").is_some_and(|name| context.text(name).ends_with("Value")) {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    let name = call.method.name.as_str();
    let index = context.resolver.index;
    if !index.is_subtype(&call.declaring, MESSAGE_BUILDER) {
        return;
    }
    let Some(field_name) = name.get(3..).filter(|rest| !rest.is_empty() && matches!(&name[..3], "set" | "add" | "put")) else { return };
    if let Some((outer, _)) = call.declaring.rsplit_once('.') {
        let number = format!("{}_FIELD_NUMBER", upper_underscore(field_name));
        let misnamed = format!("{}_FIELD_NUMBER", field_name.to_ascii_uppercase());
        if index.get(outer).is_some_and(|info| info.fields.iter().any(|field| field.name == number || field.name == misnamed)) {
            return;
        }
    }
    let arguments: Vec<Node> = node.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let at = if (name.starts_with("set") || name.starts_with("add")) && arguments.len() == 1 {
        0
    } else if name.starts_with("put") && arguments.len() == 2 {
        1
    } else {
        return;
    };
    let argument = arguments[at];
    let Some(value) = integer_value(context, argument) else { return };
    let setter = &name[..name.len() - "Value".len()];
    let Some(info) = index.get(&call.declaring) else { return };
    let found = info.methods.iter().rev().find(|method| method.name == setter && method.parameters.len() == arguments.len() && method.parameters.get(at).is_some_and(|kind| index.is_subtype(&kind.name(), MESSAGE_ENUM)));
    let Some(method) = found else { return };
    let enum_type = method.parameters[at].name();
    let Some(enumeration) = index.get(&enum_type) else { return };
    let constant = enumeration.fields.iter().find(|field| field.name.ends_with("_VALUE") && field.number.map(i64::from) == Some(value));
    let Some(constant) = constant else { return };
    let mut imports = false;
    let qualified = qualify_class(context, node, &enum_type, &mut imports);
    let replacement = format!("{qualified}.{}", constant.name.trim_end_matches("_VALUE"));
    let called = node.child_by_field_name("name").unwrap();
    let mut fix = Fix::replace(called.start_byte(), called.end_byte(), setter).and(argument.start_byte(), argument.end_byte(), replacement);
    if imports {
        fix = fix.with_imports();
    }
    context.report_fixed("AvoidValueSetter", node, position(node), "Prefer using the enum-accepting rather than the int-accepting setter for enum fields.", &[fix]);
}

