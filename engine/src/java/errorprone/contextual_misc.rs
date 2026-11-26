//! LockOnNonEnclosingClassLiteral, MissingRefasterAnnotation, MultimapKeys, MultipleParallelOrSequentialCalls,
//! NamedLikeContextualKeyword and LiteEnumValueOf.
use super::fixes::Fix;
use super::hierarchy::{declared_method, super_methods};
use super::inject_checks::{annotation_class, annotations_of};
use super::inject_codegen::generated_by;
use super::members::{is_method, members};
use super::nodes::{class_position, name_position};
use super::optional_checks::rename_invocation;
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, name_text, preferred};
use super::shape::stripped;
use super::Context;
use crate::engine::source::{children, parent};
use crate::java::types::model::Type;
use tree_sitter::Node;

const TYPES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

pub fn lock_on_non_enclosing_class_literal(context: &Context, node: Node) {
    if node.kind() != "synchronized_statement" {
        return;
    }
    let Some(lock) = node.named_child(0).map(stripped).filter(|lock| lock.kind() == "class_literal") else { return };
    let enclosing = super::parts::enclosing_class(context, node);
    let named = lock.named_child(0).and_then(|written| context.resolver.type_node(written));
    if matches!((&named, &enclosing), (Some(Type::Class(class, _)), Some(own)) if class == own) {
        return;
    }
    let message = "Lock on the class other than the enclosing class of the code block can unintentionally prevent the locked class being used properly.";
    context.report_fixed("LockOnNonEnclosingClassLiteral", node, node.start_byte(), message, &[]);
}

const REFASTER: [&str; 3] = [
    "com.google.errorprone.refaster.annotation.Placeholder",
    "com.google.errorprone.refaster.annotation.BeforeTemplate",
    "com.google.errorprone.refaster.annotation.AfterTemplate",
];

fn has_refaster_annotation(context: &Context, method: Node) -> bool {
    annotations_of(method).into_iter().any(|annotation| annotation_class(context, annotation).is_some_and(|class| REFASTER.contains(&class.as_str())))
}

pub fn missing_refaster_annotation(context: &Context, node: Node) {
    let anonymous = matches!(node.kind(), "object_creation_expression" | "enum_constant") && children(node).iter().any(|part| part.kind() == "class_body");
    if !TYPES.contains(&node.kind()) && !anonymous {
        return;
    }
    let body = if anonymous { children(node).into_iter().find(|part| part.kind() == "class_body") } else { node.child_by_field_name("body") };
    let Some(body) = body else { return };
    let kinds: Vec<bool> = members(body).into_iter().filter(|member| is_method(*member)).map(|method| has_refaster_annotation(context, method)).collect();
    if kinds.contains(&true) && kinds.contains(&false) {
        let at = if anonymous { body.start_byte() } else { class_position(node) };
        context.report_fixed("MissingRefasterAnnotation", node, at, "The Refaster template contains a method without any Refaster annotations", &[]);
    }
}

pub fn multimap_keys(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || name_text(context, node) != "keys" {
        return;
    }
    if receiver_name(context, node, false).is_none_or(|owner| !is_descendant(context, &owner, &["com.google.common.collect.Multimap"])) {
        return;
    }
    let Some(up) = parent(node) else { return };
    let iterated = match up.kind() {
        "enhanced_for_statement" => up.child_by_field_name("value") == Some(node),
        "method_invocation" => {
            up.child_by_field_name("object") == Some(node)
                && name_text(context, up) == "forEach"
                && receiver_name(context, up, false).is_some_and(|owner| is_descendant(context, &owner, &["java.util.Collection"]))
        }
        _ => false,
    };
    if iterated {
        let message = "Iterating over `Multimap.keys()` does not collapse duplicates. Did you mean `keySet()`?";
        context.report_fixed("MultimapKeys", node, preferred(node), message, &[rename_invocation(node, "keySet")]);
    }
}

fn chain_calls<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let mut found = Vec::new();
    let mut current = parent(call);
    while let Some(at) = current {
        if at.kind() == "method_invocation" {
            found.push(at);
        }
        current = parent(at);
    }
    found
}

pub fn multiple_parallel_or_sequential_calls(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = name_text(context, node);
    if !matches!(name, "stream" | "parallelStream") || receiver_name(context, node, false).is_none_or(|owner| !is_descendant(context, &owner, &["java.util.Collection"])) {
        return;
    }
    let appropriate = usize::from(name == "stream");
    let own = context.text(node);
    let mut fix = Fix::new();
    let mut to_replace = "empty";
    let mut count = 0;
    for call in chain_calls(node) {
        if arguments(call).iter().any(|argument| context.text(*argument).contains(own)) {
            break;
        }
        let Some(object) = call.child_by_field_name("object") else { continue };
        let identifier = name_text(context, call);
        if to_replace == "empty" && matches!(identifier, "parallel" | "sequential") {
            to_replace = identifier;
        }
        if identifier == to_replace {
            fix = fix.and(object.end_byte(), call.end_byte(), "");
            count += 1;
        }
    }
    if count > appropriate {
        if appropriate == 1 {
            fix = fix.insert(node.end_byte(), format!(".{}()", to_replace));
        }
        let message = "Multiple calls to either parallel or sequential are unnecessary and cause confusion.";
        context.report_fixed("MultipleParallelOrSequentialCalls", node, preferred(node), message, &[fix]);
    }
}

const CONTEXTUAL_KEYWORDS: [&str; 15] = [
    "exports", "opens", "requires", "uses", "module", "permits", "sealed", "var", "provides", "to", "with", "open", "record", "transitive", "yield",
];

const AUTO_PROCESSORS: [&str; 2] = ["com.google.auto.value.processor.AutoValueProcessor", "com.google.auto.value.processor.AutoOneOfProcessor"];

/// What `@Generated` on the classes around a node says: `ASTHelpers.getGeneratedBy(state)`.
pub fn generated_by_enclosing(context: &Context, node: Node) -> Vec<String> {
    let mut found = Vec::new();
    let mut current = Some(node);
    while let Some(at) = current {
        if TYPES.contains(&at.kind()) {
            found.extend(generated_by(context, at));
        }
        current = parent(at);
    }
    found
}

pub fn named_like_contextual_keyword(context: &Context, node: Node) {
    let message = "Avoid naming of classes and methods that is similar to contextual keywords.  When invoking such a method, qualify it.";
    match node.kind() {
        kind if TYPES.contains(&kind) => {
            if node.child_by_field_name("name").is_some_and(|name| CONTEXTUAL_KEYWORDS.contains(&context.text(name))) {
                context.report_fixed("NamedLikeContextualKeyword", node, class_position(node), message, &[]);
            }
        }
        "method_declaration" => {
            if node.child_by_field_name("name").is_none_or(|name| context.text(name) != "yield") {
                return;
            }
            if generated_by_enclosing(context, node).iter().any(|by| AUTO_PROCESSORS.contains(&by.as_str())) {
                return;
            }
            let overrides = declared_method(context, node).is_none_or(|(origin, method)| !super_methods(context.resolver.index, origin, method).is_empty());
            if !overrides {
                context.report_fixed("NamedLikeContextualKeyword", node, name_position(node), message, &[]);
            }
        }
        _ => {}
    }
}

pub fn lite_enum_value_of(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || name_text(context, node) != "valueOf" {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node).filter(|resolved| resolved.method.is_static) else { return };
    if resolved.method.parameters.len() != 1 || resolved.method.parameters[0].name() != "java.lang.String" {
        return;
    }
    let owner = if node.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring };
    let index = context.resolver.index;
    let lite = index.is_subtype(&owner, "com.google.protobuf.Internal.EnumLite")
        && !index.is_subtype(&owner, "com.google.protobuf.ProtocolMessageEnum")
        && !index.is_subtype(&owner, "com.google.protobuf.AbstractMessageLite.InternalOneOfEnum");
    if lite && !generated_by_enclosing(context, node).iter().any(|by| by == "com.ryanharter.auto.value.parcel.AutoValueParcelExtension") {
        let message = "Instead of looking up a lite enum by name, use its numeric value since that is the stable part of the protocol defined by the enum.";
        context.report_fixed("LiteEnumValueOf", node, preferred(node), message, &[]);
    }
}
