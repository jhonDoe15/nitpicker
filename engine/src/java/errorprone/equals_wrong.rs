//! EqualsWrongThing: `equals` that compares two different members of the class with each other.
use super::Context;
use super::equals_methods::equals_declaration;
use super::positions::{arguments, preferred};
use crate::engine::source::walk;
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::{OBJECT, Type, flag};
use tree_sitter::Node;

#[derive(Clone, PartialEq)]
struct Symbol {
    method: bool,
    owner: String,
    name: String,
    parameters: Vec<String>,
}

fn symbol_of(context: &Context, node: Node) -> Option<Symbol> {
    let node = unwrap(node);
    match node.kind() {
        "identifier" => match context.resolver.binding(node, context.text(node))? {
            Binding::Field(_, info, field) if field.flags & flag::STATIC == 0 => Some(Symbol { method: false, owner: info.name.clone(), name: field.name.clone(), parameters: Vec::new() }),
            _ => None,
        },
        "field_access" => {
            let object = node.child_by_field_name("object")?;
            let name = context.text(node.child_by_field_name("field")?);
            let Type::Class(owner, _) = context.resolver.type_of(object)?.erased() else { return None };
            let (info, field) = context.resolver.index.field(&owner, name)?;
            (field.flags & flag::STATIC == 0).then(|| Symbol { method: false, owner: info.name.clone(), name: field.name.clone(), parameters: Vec::new() })
        }
        "method_invocation" => {
            let resolved = context.resolver.resolve_call(node)?;
            (!resolved.method.is_static).then(|| Symbol {
                method: true,
                owner: resolved.declaring,
                name: resolved.method.name.clone(),
                parameters: resolved.method.parameters.iter().map(Type::name).collect(),
            })
        }
        _ => None,
    }
}

fn shown(symbol: &Symbol) -> String {
    if symbol.method { format!("{}()", symbol.name) } else { symbol.name.clone() }
}

const STATIC_EQUALS: [(&str, &str); 4] = [
    ("java.util.Arrays", "equals"),
    ("java.util.Objects", "equals"),
    ("com.google.common.base.Objects", "equal"),
    ("androidx.core.util.ObjectsCompat", "equals"),
];

fn sites_of<'t>(context: &Context, node: Node<'t>) -> Option<(Node<'t>, Node<'t>)> {
    match node.kind() {
        "binary_expression" if node.child_by_field_name("operator").is_some_and(|operator| matches!(context.text(operator), "==" | "!=")) => {
            Some((node.child_by_field_name("left")?, node.child_by_field_name("right")?))
        }
        "method_invocation" => {
            let name = context.text(node.child_by_field_name("name")?);
            if name != "equals" && name != "equal" {
                return None;
            }
            let resolved = context.resolver.resolve_call(node)?;
            let list = arguments(node);
            if resolved.method.is_static {
                if !STATIC_EQUALS.iter().any(|(owner, known)| *owner == resolved.declaring && *known == name) || list.len() < 2 {
                    return None;
                }
                return Some((list[0], list[list.len() / 2]));
            }
            let receiver = node.child_by_field_name("object").filter(|object| object.kind() != "super")?;
            (name == "equals" && list.len() == 1 && resolved.method.parameters == [Type::class(OBJECT)]).then(|| (receiver, list[0]))
        }
        _ => None,
    }
}

pub fn equals_wrong_thing(context: &Context, method: Node) {
    if !equals_declaration(context, method) {
        return;
    }
    let Some(body) = method.child_by_field_name("body") else { return };
    let mut sites: Vec<(Symbol, Symbol, Node, String)> = Vec::new();
    walk(body, |node| {
        let Some((left, right)) = sites_of(context, node) else { return };
        if let (Some(left), Some(right)) = (symbol_of(context, left), symbol_of(context, right)) {
            sites.push((left, right, node, String::new()));
        }
    });
    let all: Vec<(Symbol, Symbol)> = sites.iter().map(|(left, right, _, _)| (left.clone(), right.clone())).collect();
    for (left, right, node, _) in sites {
        if left.method != right.method || left.owner != right.owner || left == right || all.iter().any(|(a, b)| *a == right && *b == left) {
            continue;
        }
        let message = format!("Suspicious comparison between `{}` and `{}`", shown(&left), shown(&right));
        context.report_fixed("EqualsWrongThing", node, preferred(context, node), &message, &[]);
    }
}
