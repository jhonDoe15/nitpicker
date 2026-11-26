//! DoubleCheckedLocking.
use super::fix_helpers::add_modifiers;
use super::fixes::Fix;
use super::nodes::{token, unparenthesized};
use super::symbols::{VarSym, variable_symbol};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

/// The expression compared with `null`, whichever side it is on, in any binary expression.
fn null_checked(condition: Node) -> Option<Node> {
    let condition = unparenthesized(condition);
    if condition.kind() != "binary_expression" {
        return None;
    }
    let (left, right) = (condition.child_by_field_name("left")?, condition.child_by_field_name("right")?);
    if left.kind() == "null_literal" {
        Some(right)
    } else if right.kind() == "null_literal" {
        Some(left)
    } else {
        None
    }
}

/// The first statement of that kind, looking through blocks only.
fn first_of<'t>(statement: Node<'t>, kind: &str) -> Option<Node<'t>> {
    if statement.kind() == kind {
        return Some(statement);
    }
    if statement.kind() != "block" {
        return None;
    }
    children(statement).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")).find_map(|part| first_of(part, kind))
}

struct Dcl<'t> {
    synchronized: Node<'t>,
    inner: Node<'t>,
    symbol: VarSym,
    kind: char,
}

fn condition<'t>(statement: Node<'t>) -> Option<Node<'t>> {
    statement.child_by_field_name("condition")
}

fn find_dcl<'t>(context: &Context, outer: Node<'t>) -> Option<Dcl<'t>> {
    let tested = null_checked(condition(outer)?)?;
    let synchronized = first_of(outer.child_by_field_name("consequence")?, "synchronized_statement")?;
    let inner = first_of(synchronized.child_by_field_name("body")?, "if_statement")?;
    let inner_tested = null_checked(condition(inner)?)?;
    let symbol = variable_symbol(context, tested)?;
    if variable_symbol(context, inner_tested).as_ref() != Some(&symbol) {
        return None;
    }
    let kind = match symbol {
        VarSym::Field(..) => 'f',
        VarSym::Local(_) => 'l',
        VarSym::Other(_) => return None,
    };
    Some(Dcl { synchronized, inner, symbol, kind })
}

const IMMUTABLE: &[&str] = &["java.lang.Boolean", "java.lang.Byte", "java.lang.Short", "java.lang.Integer", "java.lang.Character", "java.lang.Float", "java.lang.String"];

/// The declaration of the field in a class around the use, when this file has it, and the field's facts.
fn field_declaration<'t>(context: &Context, from: Node<'t>, class: &str, name: &str) -> Option<Node<'t>> {
    let mut current = parent(from);
    while let Some(above) = current {
        if matches!(above.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration" | "object_creation_expression") {
            if let Some(body) = children(above).into_iter().find(|part| part.kind().ends_with("_body")).filter(|_| context.resolver.scope.names.contains_key(&above.id())) {
                for member in children(body).into_iter().chain(children(body).into_iter().flat_map(|part| if part.kind() == "enum_body_declarations" { children(part) } else { Vec::new() })) {
                    if member.kind() != "field_declaration" {
                        continue;
                    }
                    let owner = context.resolver.scope.names.get(&above.id());
                    let named = children(member).into_iter().any(|part| part.kind() == "variable_declarator" && part.child_by_field_name("name").is_some_and(|written| context.text(written) == name));
                    if named && owner.is_some_and(|owner| owner == class) {
                        return Some(member);
                    }
                }
            }
        }
        current = parent(above);
    }
    None
}

fn handle_field(context: &Context, outer: Node, class: &str, name: &str) {
    let Some((info, field)) = context.resolver.index.field(class, name) else { return };
    if field.flags & flag::VOLATILE != 0 {
        return;
    }
    let immutable = match &field.kind {
        Type::Primitive(_) => true,
        Type::Class(owner, _) => IMMUTABLE.contains(&owner.as_str()),
        _ => false,
    };
    if immutable {
        return;
    }
    let mut fixes = Vec::new();
    if let Some(declaration) = field_declaration(context, outer, &info.name, name) {
        fixes.push(add_modifiers(Fix::new(), declaration, &["volatile"]));
    }
    let at = token(outer, "if").map_or(outer.start_byte(), |keyword| keyword.start_byte());
    context.report_fixed("DoubleCheckedLocking", outer, at, "Double-checked locking on non-volatile fields is unsafe", &fixes);
}

fn handle_local(context: &Context, outer: Node, info: &Dcl) {
    let Some(body) = info.synchronized.child_by_field_name("body") else { return };
    let Some(statement) = first_of(body, "expression_statement") else { return };
    if statement.start_byte() > info.inner.start_byte() {
        return;
    }
    let Some(assign) = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")) else { return };
    if assign.kind() != "assignment_expression" || assign.child_by_field_name("operator").is_none_or(|operator| context.text(operator) != "=") {
        return;
    }
    let (Some(left), Some(right)) = (assign.child_by_field_name("left"), assign.child_by_field_name("right")) else { return };
    if variable_symbol(context, left).as_ref() != Some(&info.symbol) {
        return;
    }
    if let Some(VarSym::Field(class, name)) = variable_symbol(context, right) {
        handle_field(context, outer, &class, &name);
    }
}

pub fn double_checked_locking(context: &Context, node: Node) {
    if node.kind() != "if_statement" {
        return;
    }
    let Some(info) = find_dcl(context, node) else { return };
    match (&info.symbol, info.kind) {
        (VarSym::Field(class, name), 'f') => handle_field(context, node, class, name),
        _ => handle_local(context, node, &info),
    }
}
