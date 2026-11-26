//! `no-dropped-delegate-result`: a method whose last statement calls a same-named method on another receiver
//! and drops what it returns.
use super::names::{enclosing_names, is_accessor_or_constructor, is_hook_name};
use super::shapes::{
    Delegation, delegation_of, enclosing_function, is_inherited_receiver, is_this_receiver, is_void_annotation,
    stripped,
};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::{Types, is_declaration_file};
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::{kind, type_flags};
use std::cell::RefCell;

const RULE: &str = "no-dropped-delegate-result";
const VOID_FLAGS: u32 = type_flags::VOID | type_flags::UNDEFINED | type_flags::NEVER;

fn message(name: &str, callee: &str) -> String {
    format!("`{name}` delegates to `{callee}` but drops its result; return it.")
}

fn is_unresolved(found: &Type) -> bool {
    found.flags & type_flags::UNKNOWN != 0 || found.intrinsic_name.as_deref() == Some("error")
}

fn returns_nothing_at(types: &mut Types, node: Node, unresolved_counts: bool) -> bool {
    let compiler_kind = if node.is("AwaitExpression") { kind::AWAIT_EXPRESSION } else { kind::CALL_EXPRESSION };
    let Some(found) = types.type_of_node(compiler_kind, node.start(), node.end()) else { return false };
    let nothing = types.awaited_parts(&found).iter().all(|part| part.flags & VOID_FLAGS != 0);
    nothing || (unresolved_counts && is_unresolved(&found))
}

fn declared_in_library(types: &mut Types, callee: Node) -> bool {
    let Some(property) = callee.node("property").filter(|_| callee.is("MemberExpression")) else { return false };
    let compiler_kind = match property.kind() {
        "Identifier" => kind::IDENTIFIER,
        "PrivateIdentifier" => kind::PRIVATE_IDENTIFIER,
        _ => kind::STRING_LITERAL,
    };
    let Some(symbol) = types.symbol_of_node(compiler_kind, property.start(), property.end()) else { return false };
    symbol.declarations.iter().any(|declaration| {
        let library = |path: &str| path.contains("/node_modules/") || is_declaration_file(path);
        parse_handle(declaration).is_some_and(|(_, _, path)| library(path))
    })
}

fn delegate_ignorable(types: &mut Types, node: Node, delegation: &Delegation) -> bool {
    if is_inherited_receiver(delegation.callee) {
        return returns_nothing_at(types, node, false);
    }
    declared_in_library(types, delegation.callee) || returns_nothing_at(types, node, true)
}

fn called_expression(statement: Node) -> Option<Node> {
    let expression = stripped(statement.node("expression")?);
    if expression.is("AwaitExpression") { expression.node("argument").map(stripped) } else { Some(expression) }
}

fn dropped_delegation<'v>(types: &RefCell<Types>, statement: Node<'v>) -> Option<Delegation<'v>> {
    let call = called_expression(statement).filter(|call| call.is("CallExpression"))?;
    let delegation = delegation_of(call)?;
    let owner = enclosing_function(statement)?;
    if is_this_receiver(delegation.callee) {
        return None;
    }
    let names = enclosing_names(owner);
    let excused = !names.contains(&delegation.name)
        || names.iter().any(|name| is_hook_name(name))
        || owner.flag("generator")
        || is_accessor_or_constructor(owner)
        || is_void_annotation(owner.node("returnType"));
    if excused {
        return None;
    }
    let node = stripped(statement.node("expression")?);
    let ignorable = delegate_ignorable(&mut types.borrow_mut(), node, &delegation);
    (!ignorable).then_some(delegation)
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let text = context.file.text;
    let mut found = Vec::new();
    for statement in view.nodes().filter(|node| node.is("ExpressionStatement")) {
        let delegation = dropped_delegation(types, statement);
        if types.borrow().refused.is_some() {
            return;
        }
        if let Some(delegation) = delegation {
            let callee = &text[delegation.callee.start() as usize..delegation.callee.end() as usize];
            found.push((statement.start(), statement.end(), message(&delegation.name, callee)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
