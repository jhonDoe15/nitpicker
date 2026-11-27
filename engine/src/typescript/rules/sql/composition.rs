//! `sql-composition.mts`: the pieces a template, a concatenation or a string method puts together, and whether
//! the text they make reads as SQL for the sink it goes to.
use super::inert::{Piece, classify};
use super::sinks::Sink;
use super::text::{DYNAMIC, is_fragment_before_value, is_loose_statement, is_strong_statement, is_value_position};
use crate::typescript::rules::security_values::{member_name, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{quasi_text, string_value};

fn is_plus(node: Node) -> bool {
    node.is("BinaryExpression") && node.text("operator").as_deref() == Some("+")
}

fn template_pieces<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Vec<Piece<'s>> {
    let expressions = node.nodes("expressions");
    let mut pieces = Vec::new();
    for index in 0..node.nodes("quasis").len() {
        pieces.push(Piece { text: Some(quasi_text(node, index)), node: None });
        if let Some(value) = expressions.get(index) {
            pieces.push(classify(scopes, Some(*value)));
        }
    }
    pieces
}

fn plus_leaves(node: Node) -> Vec<Node> {
    let mut leaves = Vec::new();
    let mut pending = vec![node];
    while let Some(current) = pending.pop() {
        if is_plus(current) {
            pending.extend(current.node("right"));
            pending.extend(current.node("left"));
        } else {
            leaves.push(current);
        }
    }
    leaves
}

fn concat_pieces<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Vec<Piece<'s>>> {
    let leaves = plus_leaves(node);
    let has_text = leaves.iter().any(|leaf| string_value(Some(*leaf)).is_some() || leaf.is("TemplateLiteral"));
    has_text.then(|| leaves.into_iter().map(|leaf| classify(scopes, Some(leaf))).collect())
}

fn classified<'s>(scopes: &Scopes<'_, 's>, parts: impl IntoIterator<Item = Option<Node<'s>>>) -> Vec<Piece<'s>> {
    parts.into_iter().map(|part| classify(scopes, part)).collect()
}

fn method_pieces<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, is_format_call: &dyn Fn(Node<'s>) -> bool) -> Option<Vec<Piece<'s>>> {
    let arguments = node.list("arguments");
    if is_format_call(node) {
        return Some(classified(scopes, arguments));
    }
    let callee = node.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let name = member_name(callee);
    let object = callee.node("object");
    let list = object.map(unwrapped);
    match name.as_deref() {
        Some("concat") => Some(classified(scopes, std::iter::once(object).chain(arguments))),
        Some("join") if list.is_some_and(|list| list.is("ArrayExpression")) => list.map(|list| classified(scopes, list.list("elements"))),
        Some("replace" | "replaceAll") if arguments.len() == 2 => Some(classified(scopes, [object, arguments[1]])),
        _ => None,
    }
}

/// `compositionKind`: how the message names the way the text is built.
pub fn composition_kind(node: Node) -> &'static str {
    match node.kind() {
        "TemplateLiteral" => "a template literal",
        "BinaryExpression" | "AssignmentExpression" => "concatenation",
        _ => "a string method",
    }
}

/// `piecesOf`: the pieces of a template, a concatenation or a string method call.
pub fn pieces_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, is_format_call: &dyn Fn(Node<'s>) -> bool) -> Option<Vec<Piece<'s>>> {
    if node.is("TemplateLiteral") {
        return if node.nodes("expressions").is_empty() { None } else { Some(template_pieces(scopes, node)) };
    }
    if is_plus(node) {
        return concat_pieces(scopes, node);
    }
    if node.is("CallExpression") { method_pieces(scopes, node, is_format_call) } else { None }
}

pub fn has_runtime_value(pieces: &[Piece]) -> bool {
    pieces.iter().any(|piece| piece.node.is_some())
}

fn piece_text(piece: &Piece) -> String {
    piece.text.clone().unwrap_or_else(|| DYNAMIC.to_string())
}

/// `runtimePrefixes`: for each runtime piece, the text before it and the known text right after it.
fn runtime_prefixes(pieces: &[Piece]) -> Vec<(String, String)> {
    let mut found = Vec::new();
    for (index, piece) in pieces.iter().enumerate() {
        if piece.node.is_some() {
            let before: String = pieces[..index].iter().map(piece_text).collect();
            let after = pieces.get(index + 1).and_then(|next| next.text.clone()).unwrap_or_default();
            found.push((before, after));
        }
    }
    found
}

fn sink_test(sink: Sink, text: &str, prefixes: &[(String, String)]) -> bool {
    match sink {
        Sink::Raw => true,
        Sink::Clause => prefixes.iter().any(|(before, _)| is_value_position(before) || is_fragment_before_value(before)),
        Sink::Order => prefixes.iter().any(|(_, after)| !after.starts_with('.')),
        Sink::Query => is_loose_statement(text) || prefixes.iter().any(|(before, _)| is_fragment_before_value(before)),
    }
}

/// `looksLikeSql`: the text starts like a statement or a clause, or reads as SQL for its sink.
pub fn looks_like_sql(pieces: &[Piece], sink: impl FnOnce() -> Option<Sink>) -> bool {
    let text: String = pieces.iter().map(piece_text).collect();
    is_strong_statement(&text) || sink().is_some_and(|sink| sink_test(sink, &text, &runtime_prefixes(pieces)))
}
