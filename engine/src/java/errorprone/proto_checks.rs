//! Protocol buffer checks: private security contract fields, string fields compared by reference, `ordinal()` on enums.
use super::fixes::Fix;
use super::operators::operator;
use super::parts::preferred;
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

const SAFE_HTML_TYPES: [&str; 6] = ["SafeHtmlProto", "SafeUrlProto", "TrustedResourceUrlProto", "SafeScriptProto", "SafeStyleProto", "SafeStyleSheetProto"];
const PACKAGE: &str = "com.google.common.html.types";
const SAFE_HTML_LINK: &str = "https://github.com/google/safe-html-types/blob/master/doc/safehtml-types.md#protocol-buffer-conversion";

fn is_private_field_call(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    if !name.contains("PrivateDoNotAccessOrElse") {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    if resolved.method.is_static {
        return false;
    }
    let owner = if call.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring };
    SAFE_HTML_TYPES.iter().any(|class| owner == format!("{PACKAGE}.{class}") || owner == format!("{PACKAGE}.{class}.Builder"))
}

pub fn private_security_contract_proto_access(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !is_private_field_call(context, node) {
        return;
    }
    if context.resolver.scope.package.starts_with(PACKAGE) {
        return;
    }
    let message = format!("Forbidden access to a private proto field. See {SAFE_HTML_LINK}.");
    context.report_fixed("PrivateSecurityContractProtoAccess", node, preferred(node), &message, &[]);
}

fn proto_string_method(context: &Context, operand: Node) -> bool {
    if operand.kind() != "method_invocation" || !matches!(context.resolver.type_of(operand), Some(Type::Class(name, _)) if name == "java.lang.String") {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(operand) else { return false };
    let owner = if operand.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring };
    let index = context.resolver.index;
    !resolved.method.is_static && (index.is_subtype(&owner, "com.google.protobuf.GeneratedMessage") || index.is_subtype(&owner, "com.google.protobuf.GeneratedMessageLite"))
}

pub fn proto_string_field_reference_equality(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let Some(own) = operator(node).filter(|own| matches!(context.text(*own), "==" | "!=")) else { return };
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let matches = |first: Node, second: Node| proto_string_method(context, first) && second.kind() != "null_literal";
    if !matches(left, right) && !matches(right, left) {
        return;
    }
    let bang = if context.text(own) == "!=" { "!" } else { "" };
    let replacement = format!("{bang}{}.equals({})", context.text(left), context.text(right));
    let fix = Fix::replace(node.start_byte(), node.end_byte(), replacement);
    context.report_fixed("ProtoStringFieldReferenceEquality", node, own.start_byte(), "Comparing protobuf fields of type String using reference equality", &[fix]);
}

pub fn protocol_buffer_ordinal(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "ordinal") {
        return;
    }
    if context.resolver.matches_sig(node, "com.google.protobuf.Internal.EnumLite#ordinal()") {
        context.report_fixed("ProtocolBufferOrdinal", node, preferred(node), "To get the tag number of a protocol buffer enum, use getNumber() instead.", &[]);
    }
}
