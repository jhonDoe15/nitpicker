//! ModifySourceCollectionInStream: a collection changed from a lambda or a method reference given to a stream
//! operation of a stream made from that same collection.
use super::Context;
use super::javac_print::printed;
use super::owners::{is_descendant, receiver_name};
use super::positions::preferred;
use super::symbol_key::{SymbolKey, reference_key};
use crate::engine::source::parent;
use tree_sitter::Node;

const MUTATIONS: &[&str] = &["add", "addAll", "clear", "remove", "removeAll", "retainAll"];
const COLLECTION: &str = "java.util.Collection";

fn named(context: &Context, call: Node, names: &[&str]) -> bool {
    call.kind() == "method_invocation" && call.child_by_field_name("name").is_some_and(|name| names.contains(&context.text(name)))
}

/// `instanceMethod().onDescendantOf(owner)`.
fn instance_on(context: &Context, call: Node, owner: &str) -> bool {
    call.kind() == "method_invocation" && receiver_name(context, call, false).is_some_and(|name| is_descendant(context, &name, &[owner]))
}

#[derive(PartialEq)]
enum Symbol {
    Variable(SymbolKey),
    Method(String),
    None,
}

/// `ASTHelpers.getSymbol` of an expression, for comparing.
fn symbol(context: &Context, node: Node) -> Symbol {
    if node.kind() == "method_invocation" {
        return match context.resolver.resolve_call(node) {
            Some(call) => Symbol::Method(format!("{}.{}{:?}", call.declaring, call.method.name, call.method.parameters)),
            None => Symbol::None,
        };
    }
    reference_key(context, node).map_or(Symbol::None, Symbol::Variable)
}

fn same_expression(context: &Context, left: Node, right: Node) -> bool {
    if symbol(context, left) != symbol(context, right) {
        return false;
    }
    let shown = |node: Node| {
        let text = printed(context.file, node);
        text.strip_prefix("this.").map(str::to_string).unwrap_or(text)
    };
    shown(left) == shown(right)
}

/// The calls of stream operations lead back to `stream()` or `parallelStream()` on the same collection.
fn on_stream_source(context: &Context, root: Node, source: Node) -> bool {
    let mut current = root;
    while instance_on(context, current, "java.util.stream.BaseStream") {
        let Some(receiver) = current.child_by_field_name("object") else { return false };
        current = receiver;
    }
    if !named(context, current, &["stream", "parallelStream"]) || !instance_on(context, current, COLLECTION) {
        return false;
    }
    current.child_by_field_name("object").is_some_and(|receiver| same_expression(context, receiver, source))
}

fn enclosing<'t>(node: Node<'t>, kind: &str) -> Option<Node<'t>> {
    let mut current = parent(node);
    while let Some(at) = current {
        if at.kind() == kind {
            return Some(at);
        }
        current = parent(at);
    }
    None
}

fn mutating_call(context: &Context, call: Node) {
    if !named(context, call, MUTATIONS) || !instance_on(context, call, COLLECTION) {
        return;
    }
    let Some(mutated) = call.child_by_field_name("object") else { return };
    let Some(lambda) = enclosing(call, "lambda_expression") else { return };
    let Some(root) = parent(lambda).filter(|holder| holder.kind() == "argument_list").and_then(parent) else { return };
    if on_stream_source(context, root, mutated) {
        context.report("ModifySourceCollectionInStream", call, preferred(context, call), MESSAGE);
    }
}

fn mutating_reference(context: &Context, reference: Node) {
    let Some(qualifier) = reference.named_child(0) else { return };
    let Some(name) = reference.named_child((reference.named_child_count() as u32).saturating_sub(1)).filter(|name| name.kind() == "identifier") else { return };
    if !MUTATIONS.contains(&context.text(name)) {
        return;
    }
    let kind = context.resolver.type_of(qualifier).or_else(|| context.resolver.type_node(qualifier));
    if !kind.is_some_and(|kind| is_descendant(context, &kind.erased().name(), &[COLLECTION])) {
        return;
    }
    let Some(root) = enclosing(reference, "method_invocation") else { return };
    if on_stream_source(context, root, qualifier) {
        context.report("ModifySourceCollectionInStream", reference, reference.start_byte(), MESSAGE);
    }
}

const MESSAGE: &str = "Modifying the backing source during stream operations may cause unintended results.";

pub fn modify_source_collection_in_stream(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => mutating_call(context, node),
        "method_reference" => mutating_reference(context, node),
        _ => {}
    }
}
