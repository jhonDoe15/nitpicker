//! What a rule finds in the uses of a chunk: text collected one chunk at a time, a chunk decoded on its own, a
//! chunk searched for a match.
use super::chunk_sources::Chunk;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const MATCHERS: [&str; 6] = ["includes", "indexOf", "startsWith", "endsWith", "match", "search"];

pub enum Kind {
    Collected(String),
    Decoded,
    Matched(String),
}

pub struct Use {
    pub kind: Kind,
    pub start: u32,
    pub end: u32,
}

fn named(node: Option<Node>, wanted: &str) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().is_some_and(|name| name == wanted))
}

fn is_text_call(call: Node, chunk: Node) -> bool {
    let Some(callee) = call.node("callee") else { return false };
    let arguments = call.nodes("arguments");
    if callee.is("Identifier") {
        return callee.name().is_some_and(|name| name == "String") && arguments.first() == Some(&chunk);
    }
    let decodes = callee.is("MemberExpression") && callee.node("object") == Some(chunk) && named(callee.node("property"), "toString");
    let text = arguments.first().is_none_or(|encoding| {
        encoding.is("Literal") && encoding.text("value").is_some_and(|value| value == "utf8" || value == "utf-8")
    });
    decodes && text
}

fn as_text(identifier: Node) -> Node {
    let Some(parent) = identifier.parent() else { return identifier };
    let call = if parent.is("MemberExpression") { parent.parent() } else { Some(parent) };
    match call {
        Some(call) if call.is("CallExpression") && is_text_call(call, identifier) => call,
        _ => identifier,
    }
}

fn is_definition_name(scopes: &Scopes, symbol: oxc_semantic::SymbolId, identifier: Node) -> bool {
    scopes.defs(symbol).iter().any(|definition| definition.name == identifier)
}

fn text_nodes<'v>(scopes: &Scopes<'_, 'v>, identifier: Node<'v>) -> Vec<Node<'v>> {
    let text = as_text(identifier);
    let declarator = text.parent().filter(|declarator| declarator.is("VariableDeclarator"));
    let alias = declarator
        .filter(|declarator| text != identifier && declarator.node("init") == Some(text))
        .and_then(|declarator| declarator.node("id").filter(|id| id.is("Identifier")))
        .and_then(|id| scopes.variable_named(id));
    let mut found = vec![text];
    if let Some(alias) = alias {
        found.extend(
            scopes.references(alias).into_iter().map(|reference| reference.identifier).filter(|found| !is_definition_name(scopes, alias, *found)),
        );
    }
    found
}

fn target_name(context: &Context, scopes: &Scopes, target: Node, inside: Node) -> Option<String> {
    if target.is("MemberExpression") {
        return Some(context.file.slice(target.start(), target.end()).to_string());
    }
    if !target.is("Identifier") {
        return None;
    }
    let name = target.name()?;
    let variable = scopes.variable_by_name(&name, inside.start())?;
    let inside_range = |node: Node| inside.start() <= node.start() && node.end() <= inside.end();
    let declared_inside = scopes.defs(variable).iter().any(|definition| inside_range(definition.name));
    (!declared_inside).then(|| name.into_owned())
}

fn collected_target(context: &Context, scopes: &Scopes, text: Node, inside: Node) -> Option<String> {
    let parent = text.parent().filter(|parent| parent.is("AssignmentExpression") && parent.node("right") == Some(text))?;
    let is_add = parent.text("operator").is_some_and(|operator| operator == "+=");
    if is_add { target_name(context, scopes, parent.node("left")?, inside) } else { None }
}

fn has_stream_option(argument: Option<&Node>) -> bool {
    let Some(argument) = argument else { return false };
    !argument.is("ObjectExpression")
        || argument.nodes("properties").iter().any(|property| property.is("SpreadElement") || named(property.node("key"), "stream"))
}

fn matched_by(text: Node) -> Option<String> {
    let parent = text.parent()?;
    if parent.is("MemberExpression") && parent.node("object") == Some(text) {
        let property = parent.node("property").filter(|property| property.is("Identifier"))?;
        let method = property.name().filter(|method| MATCHERS.contains(&method.as_ref()));
        let called = parent.parent().is_some_and(|call| call.is("CallExpression") && call.node("callee") == Some(parent));
        if let Some(method) = method.filter(|_| called) {
            return Some(method.into_owned());
        }
    }
    let tested = parent.is("CallExpression")
        && parent.nodes("arguments").first() == Some(&text)
        && parent.node("callee").is_some_and(|callee| callee.is("MemberExpression") && named(callee.node("property"), "test"));
    tested.then(|| "test".to_string())
}

fn decode_call<'v>(identifier: Node<'v>, is_decoder: &mut dyn FnMut(Node) -> Option<bool>) -> Option<Option<Node<'v>>> {
    let Some(parent) = identifier.parent().filter(|parent| parent.is("CallExpression")) else { return Some(None) };
    let arguments = parent.nodes("arguments");
    let callee = parent.node("callee").filter(|callee| callee.is("MemberExpression") && named(callee.node("property"), "decode"));
    let Some(callee) = callee.filter(|_| arguments.first() == Some(&identifier)) else { return Some(None) };
    if !is_decoder(callee.node("object")?)? || has_stream_option(arguments.get(1)) {
        return Some(None);
    }
    Some(Some(parent))
}

pub fn uses_of(
    context: &Context,
    scopes: &Scopes,
    chunk: &Chunk,
    is_decoder: &mut dyn FnMut(Node) -> Option<bool>,
) -> Option<Vec<Use>> {
    let mut found = Vec::new();
    for reference in scopes.references(chunk.variable) {
        let identifier = reference.identifier;
        if !identifier.is("Identifier") || is_definition_name(scopes, chunk.variable, identifier) {
            continue;
        }
        if let Some(call) = decode_call(identifier, is_decoder)? {
            found.push(Use { kind: Kind::Decoded, start: call.start(), end: call.end() });
            continue;
        }
        for text in text_nodes(scopes, identifier) {
            let site = text.parent().unwrap_or(text);
            let (start, end) = (site.start(), site.end());
            if let Some(target) = collected_target(context, scopes, text, chunk.scope_node) {
                found.push(Use { kind: Kind::Collected(target), start, end });
            } else if let Some(method) = matched_by(text) {
                found.push(Use { kind: Kind::Matched(method), start, end });
            }
        }
    }
    Some(found)
}
