//! ASTHelpersSuggestions: calls on javac's `Symbol` that Error Prone's `ASTHelpers` has a helper for, in a compilation
//! that has `ASTHelpers` and outside the class `ASTHelpers` itself.
use super::Context;
use super::fixes::Fix;
use super::flogger_calls::on_descendant;
use super::lookup::field_of;
use super::odd_calls::receiver_class;
use super::positions::preferred;
use super::reach::is_statement_switch;
use crate::engine::source::{children, parent};
use tree_sitter::Node;

const AST_HELPERS: &str = "com.google.errorprone.util.ASTHelpers";
const SYMBOL: &str = "com.sun.tools.javac.code.Symbol";
const MODULE_SYMBOL: &str = "com.sun.tools.javac.code.Symbol.ModuleSymbol";
const MESSAGE: &str = "Prefer ASTHelpers instead of calling this API directly";

const CLASSES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

/// The full name of the top-level class around the node.
fn outermost(context: &Context, node: Node) -> Option<String> {
    let mut found = None;
    let mut current = parent(node);
    while let Some(at) = current {
        if CLASSES.contains(&at.kind()) {
            found = Some(at);
        }
        current = parent(at);
    }
    let name = context.text(found?.child_by_field_name("name")?);
    let package = &context.resolver.scope.package;
    Some(if package.is_empty() { name.to_string() } else { format!("{package}.{name}") })
}

/// `instanceMethod().onClass(type that ModuleSymbol is a subtype of).named("isStatic")`.
fn module_is_static(context: &Context, call: Node) -> bool {
    if call.child_by_field_name("name").is_none_or(|name| context.text(name) != "isStatic") {
        return false;
    }
    if context.resolver.resolve_call(call).is_none_or(|resolved| resolved.method.is_static) {
        return false;
    }
    receiver_class(context, call).is_some_and(|class| context.resolver.index.is_subtype(MODULE_SYMBOL, &class))
}

/// `symbol.owner`: the instance field `owner` that `Symbol` itself declares.
fn symbol_owner<'t>(context: &Context, receiver: Node<'t>) -> Option<Node<'t>> {
    if receiver.kind() != "field_access" || receiver.child_by_field_name("field").is_none_or(|name| context.text(name) != "owner") {
        return None;
    }
    let (owner, field) = field_of(context, receiver)?;
    (owner.name == SYMBOL && field.flags & crate::java::types::model::flag::STATIC == 0).then(|| receiver.child_by_field_name("object"))?
}

/// Where javac's receiver of a call or field read ends: after `super` in `Outer.super.m()`, else after the object.
fn receiver_end(node: Node, object: Node) -> usize {
    children(node).into_iter().find(|part| part.kind() == "super").map_or(object.end_byte(), |part| part.end_byte())
}

fn helper(context: &Context, call: Node, name: &str, receiver_end: usize, suffix: &str) {
    let fix = Fix::replace(call.start_byte(), call.start_byte(), format!("{name}(")).and(receiver_end, call.end_byte(), suffix).with_imports();
    context.report_fixed("ASTHelpersSuggestions", call, preferred(context, call), MESSAGE, &[fix]);
}

/// Whether javac's parent of the call is an expression statement: also the items of a `for` header, but not the body
/// of a rule of a switch expression, which javac reads as a `yield`.
fn in_statement(call: Node) -> bool {
    let Some(holder) = parent(call) else { return false };
    match holder.kind() {
        "for_statement" => holder.child_by_field_name("condition") != Some(call),
        "expression_statement" => {
            let switch = parent(holder).filter(|rule| rule.kind() == "switch_rule").and_then(parent).and_then(parent);
            !switch.is_some_and(|switch| switch.kind() == "switch_expression" && !is_statement_switch(switch))
        }
        _ => false,
    }
}

pub fn ast_helpers_suggestions(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    if outermost(context, call).is_none_or(|class| class == AST_HELPERS) || !context.resolver.index.has(AST_HELPERS) {
        return;
    }
    if on_descendant(context, call, SYMBOL, &["packge", "getEnclosedElements"], false) || module_is_static(context, call) {
        let written = call.child_by_field_name("name").map_or("", |name| context.text(name));
        let name = if written == "packge" { "enclosingPackage" } else { written };
        let statement = in_statement(call);
        let suffix = if name == "enclosingPackage" && !statement { ").orElseThrow()" } else { ")" };
        helper(context, call, name, receiver_end(call, receiver), suffix);
        return;
    }
    if on_descendant(context, call, SYMBOL, &["enclClass"], false) {
        if let Some(symbol) = symbol_owner(context, receiver) {
            helper(context, call, "enclosingClass", receiver_end(receiver, symbol), ")");
        }
    }
}
