//! ThrowNull, VarTypeName, UnusedAnonymousClass, UnusedCollectionModifiedInPlace and UnicodeDirectionalityCharacters.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::nodes::class_position;
use super::parts::new_keyword;
use super::positions::{arguments, preferred};
use crate::engine::source::{children, named_children, parent};
use tree_sitter::Node;

pub fn throw_null(context: &Context, statement: Node) {
    if statement.kind() != "throw_statement" {
        return;
    }
    let Some(thrown) = statement.named_child(0).filter(|thrown| thrown.kind() == "null_literal") else { return };
    let fix = Fix::replace(thrown.start_byte(), thrown.end_byte(), "new NullPointerException()");
    let message = "Throwing 'null' always results in a NullPointerException being thrown.";
    context.report_fixed("ThrowNull", statement, statement.start_byte(), message, &[fix]);
}

pub fn var_type_name(context: &Context, node: Node) {
    let message = "`var` should not be used as a type name.";
    match node.kind() {
        "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration" => {
            if node.child_by_field_name("name").is_some_and(|name| context.text(name) == "var") {
                context.report_fixed("VarTypeName", node, class_position(node), message, &[]);
            }
        }
        "type_parameter" => {
            let name = children(node).into_iter().find(|part| part.kind() == "type_identifier");
            if let Some(name) = name.filter(|name| context.text(*name) == "var") {
                context.report_fixed("VarTypeName", node, name.start_byte(), message, &[]);
            }
        }
        _ => {}
    }
}

/// Whether the class of an anonymous class creation has a constructor without side effects: an interface, or `Thread`.
fn side_effect_free(context: &Context, creation: Node) -> bool {
    let Some(written) = creation.child_by_field_name("type") else { return false };
    let Some(crate::java::types::model::Type::Class(name, _)) = context.resolver.type_node(written) else { return false };
    name == "java.lang.Thread" || context.resolver.index.get(&name).is_some_and(|info| info.is_interface)
}

/// A `case ... -> expression;` of a switch expression, whose body javac makes a `yield`.
fn yielded(statement: Node) -> bool {
    let rule = parent(statement).filter(|rule| rule.kind() == "switch_rule");
    rule.and_then(|rule| parent(parent(rule)?)).is_some_and(|switch| !super::unused::switch_is_statement(switch))
}

pub fn unused_anonymous_class(context: &Context, creation: Node) {
    if creation.kind() != "object_creation_expression" || !parent(creation).is_some_and(|up| up.kind() == "expression_statement" && !yielded(up)) {
        return;
    }
    let Some(body) = children(creation).into_iter().find(|part| part.kind() == "class_body") else { return };
    if !arguments(creation).is_empty() {
        return;
    }
    for member in named_children(body) {
        match member.kind() {
            "block" | "static_initializer" => return,
            "field_declaration" if named_children(member).into_iter().any(|part| part.kind() == "variable_declarator" && part.child_by_field_name("value").is_some()) => return,
            _ => {}
        }
    }
    if side_effect_free(context, creation) {
        context.report_fixed("UnusedAnonymousClass", creation, new_keyword(creation), "Instance created but never used", &[]);
    }
}

const DESTRUCTIVE: [&str; 7] = ["copy", "fill", "reverse", "rotate", "shuffle", "sort", "swap"];

pub fn unused_collection_modified_in_place(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "java.util.Collections", &DESTRUCTIVE) {
        return;
    }
    let Some(first) = arguments(call).first().copied() else { return };
    let constructs = first.kind() == "object_creation_expression" || static_on_class(context, first, "com.google.common.collect.Lists", &["newArrayList", "newLinkedList"]);
    if constructs {
        let message = "Collection is modified in place, but the result is not used";
        context.report_fixed("UnusedCollectionModifiedInPlace", call, preferred(context, call), message, &[]);
    }
}

pub fn unicode_directionality_characters(context: &Context, _root: Node) {
    let text = &context.file.text;
    for (at, character) in text.char_indices() {
        if matches!(character, '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}') {
            let fix = Fix::replace(at, at + character.len_utf8(), format!("\\u{:04x}", character as u32));
            let message = "Unicode directionality modifiers can be used to conceal code in many editors.";
            context.report_always_fixed("UnicodeDirectionalityCharacters", at, message, &[fix]);
        }
    }
}
