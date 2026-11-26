//! Checks on how collections are built.
use super::fixes::Fix;
use super::shape::{arguments, parts, preferred, stripped};
use super::Context;
use crate::engine::source::{ancestor, children, parent};
use crate::java::types::model::Type;
use tree_sitter::Node;

struct Kind {
    collection: &'static str,
    mutator: &'static str,
    factory: &'static str,
}

const KINDS: [Kind; 4] = [
    Kind { collection: "Map", mutator: "put", factory: "ImmutableMap" },
    Kind { collection: "Set", mutator: "add", factory: "ImmutableSet" },
    Kind { collection: "List", mutator: "add", factory: "ImmutableList" },
    Kind { collection: "Collection", mutator: "add", factory: "ImmutableList" },
];

fn mutation_arguments<'t>(context: &Context, statement: Node<'t>, kind: &Kind) -> Option<Vec<Node<'t>>> {
    if statement.kind() != "expression_statement" {
        return None;
    }
    let call = parts(statement).into_iter().next().filter(|call| call.kind() == "method_invocation")?;
    if call.child_by_field_name("name").is_none_or(|name| context.text(name) != kind.mutator) {
        return None;
    }
    let resolved = context.resolver.resolve_call(call)?;
    let receiver = if call.child_by_field_name("object").is_some() { resolved.receiver.name() } else { resolved.declaring.clone() };
    let owner = format!("java.util.{}", kind.collection);
    (!resolved.method.is_static && context.resolver.index.is_subtype(&receiver, &owner)).then(|| arguments(call))
}

struct Enclosing<'t> {
    unmodifiable: Option<Node<'t>>,
    constant: bool,
    type_tree: Option<Node<'t>>,
    to_replace: Option<Node<'t>>,
}

fn enclosing<'t>(context: &Context, creation: Node<'t>, kind: &Kind) -> Enclosing<'t> {
    let mut found = Enclosing { unmodifiable: None, constant: false, type_tree: None, to_replace: None };
    let wrapper = format!("unmodifiable{}", kind.collection);
    let mut current = parent(creation);
    while let Some(holder) = current {
        let holder = if holder.kind() == "argument_list" { parent(holder).unwrap_or(holder) } else { holder };
        match holder.kind() {
            "method_invocation" if holder.child_by_field_name("name").is_some_and(|name| context.text(name) == wrapper) && context.resolver.matches_sig(holder, &format!("java.util.Collections#{wrapper}(_)")) => {
                found.unmodifiable = Some(holder);
            }
            "parenthesized_expression" => {}
            "variable_declarator" => {
                found.to_replace = holder.child_by_field_name("value");
                let declaration = parent(holder);
                found.type_tree = declaration.and_then(|declaration| declaration.child_by_field_name("type"));
                found.constant = declaration.is_some_and(|declaration| match declaration.kind() {
                    "field_declaration" => crate::java::helpers::has_modifier(declaration, "static") && crate::java::helpers::has_modifier(declaration, "final"),
                    "constant_declaration" => true,
                    _ => false,
                });
                break;
            }
            "return_statement" => {
                found.to_replace = parts(holder).into_iter().next();
                found.type_tree = ancestor(holder, &["method_declaration"]).and_then(|method| method.child_by_field_name("type"));
                break;
            }
            _ => break,
        }
        current = parent(holder);
    }
    found
}

fn replacement(context: &Context, creation: Node, kind: &Kind, lines: &[String]) -> String {
    if kind.factory == "ImmutableMap" && lines.len() > 5 {
        let type_arguments = creation
            .child_by_field_name("type")
            .filter(|kind| kind.kind() == "generic_type")
            .and_then(|generic| children(generic).into_iter().find(|part| part.kind() == "type_arguments"))
            .map(|list| parts(list).iter().map(|part| context.text(*part)).collect::<Vec<_>>().join(", "))
            .map(|joined| format!("<{joined}>"))
            .unwrap_or_default();
        let puts: String = lines.iter().map(|line| format!(".put({line})")).collect();
        return format!("ImmutableMap.{type_arguments}builder(){puts}.buildOrThrow()");
    }
    format!("{}.of({})", kind.factory, lines.join(", "))
}

fn fix_for(context: &Context, creation: Node, block: Node, kind: &Kind) -> Option<Fix> {
    let mut lines = Vec::new();
    let mut null_argument = false;
    for statement in parts(block) {
        let args = mutation_arguments(context, statement, kind)?;
        null_argument |= args.iter().any(|arg| arg.kind() == "null_literal");
        let shown: Vec<&str> = args.iter().map(|arg| context.text(stripped(*arg))).collect();
        lines.push(format!("\n{}", shown.join(", ")));
    }
    if null_argument {
        return None;
    }
    let around = enclosing(context, creation, kind);
    let text = replacement(context, creation, kind, &lines);
    let immutable = format!("Immutable{}", kind.collection);
    if around.unmodifiable.is_some() || around.constant {
        let mut fix = Fix::new();
        if let Some(mut tree) = around.type_tree {
            if tree.kind() == "generic_type" {
                tree = children(tree).into_iter().next().unwrap_or(tree);
            }
            fix = fix.and(tree.start_byte(), tree.end_byte(), immutable);
        }
        let target = around.unmodifiable.or(around.to_replace)?;
        return Some(fix.and(target.start_byte(), target.end_byte(), text).with_imports());
    }
    let identifier = creation.child_by_field_name("type")?;
    Some(Fix::replace(identifier.end_byte(), creation.end_byte(), format!("({text})")).with_imports())
}

const DOUBLE_BRACE: &str = "Prefer collection factory methods or builders to the double-brace initialization pattern.";

pub fn double_brace_initialization(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression" {
        return;
    }
    let Some(body) = children(node).into_iter().find(|part| part.kind() == "class_body") else { return };
    let members = parts(body);
    if members.len() != 1 || members[0].kind() != "block" {
        return;
    }
    let Some(Type::Class(name, _)) = context.resolver.type_of(node) else { return };
    let Some(kind) = KINDS.iter().find(|kind| context.resolver.index.is_subtype(&name, &format!("java.util.{}", kind.collection))) else { return };
    let fixes: Vec<Fix> = fix_for(context, node, members[0], kind).into_iter().collect();
    context.report_fixed("DoubleBraceInitialization", node, preferred(node), DOUBLE_BRACE, &fixes);
}
