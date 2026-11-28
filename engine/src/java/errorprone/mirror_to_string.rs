//! SymbolToString and TypeToString: `toString` of an `Element` or `TypeMirror` compared with `String#equals`.
use super::Context;
use super::consts::{Const, constant};
use super::contextual_misc::generated_by_enclosing;
use super::fixes::Fix;
use super::identifier_data::{IDENTIFIER_PART, IDENTIFIER_START};
use super::parameter_name::in_table;
use super::method_call_checks::{erased_subtype, variable_in_scope};
use super::shape::qualify_type;
use crate::engine::source::parent;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub(super) const SYMBOL: &str = "SymbolToString";
pub(super) const TYPE: &str = "TypeToString";
const ELEMENT: &str = "javax.lang.model.element.Element";
const TYPE_MIRROR: &str = "javax.lang.model.type.TypeMirror";
const BUG_CHECKER: &str = "com.google.errorprone.bugpatterns.BugChecker";
const PRIMITIVES: [(&str, &str); 9] = [
    ("boolean", "BOOLEAN"),
    ("byte", "BYTE"),
    ("short", "SHORT"),
    ("int", "INT"),
    ("long", "LONG"),
    ("char", "CHAR"),
    ("float", "FLOAT"),
    ("double", "DOUBLE"),
    ("void", "VOID"),
];

/// The `equals` call whose method select is the parent of `matched`: `STRING_EQUALS` on that select.
fn equals_call<'a>(context: &Context, matched: Node<'a>) -> Option<Node<'a>> {
    let call = parent(matched).filter(|call| call.kind() == "method_invocation")?;
    let selects = call.child_by_field_name("object").is_some_and(|object| object.id() == matched.id());
    let named = call.child_by_field_name("name").is_some_and(|name| context.text(name) == "equals");
    let string = context.resolver.type_of(matched) == Some(Type::class("java.lang.String"));
    (selects && named && string).then_some(call)
}

fn declared_as_bug_checker(context: &Context, ancestor: Node) -> bool {
    let index = context.resolver.index;
    let subtype = |kind: Option<Type>| matches!(kind, Some(Type::Class(name, _)) if index.is_subtype(&name, BUG_CHECKER));
    match ancestor.kind() {
        "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" => {
            context.resolver.scope.names.get(&ancestor.id()).is_some_and(|name| index.is_subtype(name, BUG_CHECKER))
        }
        "local_variable_declaration" | "field_declaration" | "formal_parameter" | "spread_parameter" | "catch_formal_parameter" | "resource" => {
            subtype(context.resolver.declared_type(ancestor, None))
        }
        "variable_declarator" => parent(ancestor).is_some_and(|holder| subtype(context.resolver.declared_type(holder, Some(ancestor)))),
        kind if kind.ends_with("_expression") => subtype(context.resolver.type_of(ancestor)),
        _ => false,
    }
}

/// `ASTHelpers.isBugCheckerCode`: some tree around the node has a type that is a `BugChecker`.
fn in_bug_checker_code(context: &Context, matched: Node) -> bool {
    if !context.resolver.index.has(BUG_CHECKER) {
        return false;
    }
    let mut current = Some(matched);
    while let Some(at) = current {
        if declared_as_bug_checker(context, at) {
            return true;
        }
        current = parent(at);
    }
    false
}

/// Whether `kind` is the type the check flags for a value stringified at `matched`.
pub(super) fn matches_mirror(context: &Context, matched: Node, kind: &Type, symbol: bool) -> bool {
    if *kind == Type::Null {
        return false;
    }
    if symbol {
        return in_bug_checker_code(context, matched)
            && erased_subtype(context, matched, kind, ELEMENT, 0)
            && equals_call(context, matched).is_some();
    }
    let auto_value = generated_by_enclosing(context, matched).iter().any(|name| name.starts_with("com.google.auto.value.processor."));
    !auto_value && erased_subtype(context, matched, kind, TYPE_MIRROR, 0) && equals_call(context, matched).is_some()
}

fn class_name_shape(text: &str) -> bool {
    text.split('.').all(|part| {
        let mut chars = part.chars();
        chars.next().is_some_and(|c| in_table(IDENTIFIER_START, c)) && chars.all(|c| in_table(IDENTIFIER_PART, c))
    })
}

fn processing_expression(context: &Context, at: Node, direct: &str, getter: &str) -> Option<String> {
    variable_in_scope(context, at, direct).or_else(|| {
        variable_in_scope(context, at, "javax.annotation.processing.ProcessingEnvironment").map(|environment| format!("{environment}.{getter}()"))
    })
}

fn constant_name_fix(context: &Context, matched: Node, lhs: &str, rhs: Node) -> Option<Fix> {
    let Some(Const::Str(value)) = constant(context, rhs) else { return None };
    if !class_name_shape(&value) {
        return None;
    }
    let call = equals_call(context, matched)?;
    let replace = |text: String| Fix::replace(call.start_byte(), call.end_byte(), text).with_imports();
    if let Some((_, kind)) = PRIMITIVES.iter().find(|(name, _)| *name == value) {
        let type_kind = qualify_type(context, matched, "javax.lang.model.type.TypeKind");
        return Some(replace(format!("{lhs}.getKind() == {type_kind}.{kind}")));
    }
    let types = processing_expression(context, matched, "javax.lang.model.util.Types", "getTypeUtils")?;
    let elements = processing_expression(context, matched, "javax.lang.model.util.Elements", "getElementUtils")?;
    let objects = qualify_type(context, matched, "java.util.Objects");
    Some(replace(format!("{objects}.equals({types}.asElement({lhs}), {elements}.getTypeElement({}))", context.text(rhs))))
}

fn same_type_fix(context: &Context, matched: Node, lhs: &str, argument: Node) -> Option<Fix> {
    if argument.kind() != "method_invocation" || argument.child_by_field_name("name").is_none_or(|name| context.text(name) != "toString") {
        return None;
    }
    let receiver = argument.child_by_field_name("object")?;
    let types = processing_expression(context, matched, "javax.lang.model.util.Types", "getTypeUtils")?;
    let kind = context.resolver.type_of(receiver)?;
    if !erased_subtype(context, receiver, &kind, TYPE_MIRROR, 0) {
        return None;
    }
    let call = equals_call(context, matched)?;
    Some(Fix::replace(call.start_byte(), call.end_byte(), format!("{types}.isSameType({lhs}, {})", context.text(receiver))))
}

/// `TypeToString.toStringFix` for `type.toString().equals(...)`.
pub(super) fn type_fix(context: &Context, matched: Node, stringified: Node) -> Option<Fix> {
    let call = equals_call(context, matched)?;
    let argument = super::shape::arguments(call).first().copied()?;
    let lhs = context.text(stringified);
    constant_name_fix(context, matched, lhs, argument).or_else(|| same_type_fix(context, matched, lhs, argument))
}

