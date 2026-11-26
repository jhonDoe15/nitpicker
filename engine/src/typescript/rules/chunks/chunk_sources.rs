//! Where a stream's chunks come from: a `data` listener or a `for await` loop, and what decides that the chunks
//! are binary.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use oxc_semantic::SymbolId;
use regex::Regex;
use std::sync::LazyLock;

const LISTENERS: [&str; 4] = ["on", "once", "addListener", "prependListener"];
const BINARY_TYPES: [&str; 4] = ["Buffer", "Uint8Array", "ArrayBuffer", "Uint8ClampedArray"];

static STREAM_TYPE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("Readable|Duplex|Transform|PassThrough|Socket|IncomingMessage|ReadStream|ChildProcess").expect("pattern"));
static STREAM_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:stdout|stderr|stdin|socket|req|res|request|response|stream)$").expect("pattern"));
static ENCODED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?-u:\b)encoding(?-u:\b)|setEncoding").expect("pattern"));
static STRING_ENCODING: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"createReadStream\([^;]{0,200}?,[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]*['"`](?:utf-?8|utf16le|ucs-?2|latin1|binary|ascii|base64|hex)['"`]"#)
        .expect("pattern")
});

pub struct Chunk<'v> {
    pub variable: SymbolId,
    pub receiver: Node<'v>,
    pub scope_node: Node<'v>,
}

fn first_binding(pattern: Node) -> Option<Node> {
    match pattern.kind() {
        "Identifier" => Some(pattern),
        "ObjectPattern" => pattern.nodes("properties").into_iter().find_map(|property| {
            first_binding(if property.is("Property") { property.node("value")? } else { property })
        }),
        "RestElement" => first_binding(pattern.node("argument")?),
        "ArrayPattern" => pattern.nodes("elements").into_iter().find_map(first_binding),
        "AssignmentPattern" => first_binding(pattern.node("left")?),
        "TSParameterProperty" => first_binding(pattern.node("parameter")?),
        _ => None,
    }
}

fn first_variable(scopes: &Scopes, patterns: Vec<Node>) -> Option<SymbolId> {
    patterns.into_iter().find_map(first_binding).and_then(|identifier| scopes.variable_named(identifier))
}

fn handler_variable(scopes: &Scopes, handler: Node) -> Option<SymbolId> {
    if let Some(id) = handler.node("id").filter(|_| handler.is("FunctionExpression")) {
        return scopes.variable_named(id);
    }
    first_variable(scopes, handler.nodes("params"))
}

pub fn data_listener<'v>(scopes: &Scopes, call: Node<'v>) -> Option<Chunk<'v>> {
    let callee = call.node("callee")?;
    let arguments = call.nodes("arguments");
    let (event, handler) = (arguments.first()?, arguments.get(1)?);
    let property = callee.node("property")?;
    let registers = callee.is("MemberExpression")
        && !callee.flag("computed")
        && property.is("Identifier")
        && property.name().is_some_and(|name| LISTENERS.contains(&name.as_ref()));
    let is_data = event.is("Literal") && event.text("value").is_some_and(|value| value == "data");
    if !registers || !is_data || !matches!(handler.kind(), "ArrowFunctionExpression" | "FunctionExpression") {
        return None;
    }
    Some(Chunk { variable: handler_variable(scopes, *handler)?, receiver: callee.node("object")?, scope_node: *handler })
}

pub fn stream_loop<'v>(scopes: &Scopes, node: Node<'v>) -> Option<Chunk<'v>> {
    let left = node.node("left").filter(|left| left.is("VariableDeclaration"))?;
    if !node.flag("await") {
        return None;
    }
    let declarators: Vec<Node> = left.nodes("declarations").into_iter().filter_map(|declarator| declarator.node("id")).collect();
    Some(Chunk { variable: first_variable(scopes, declarators)?, receiver: node.node("right")?, scope_node: node.node("body")? })
}

fn is_stream_receiver(types: &mut Types, receiver: Node) -> Option<bool> {
    let named = if receiver.is("Identifier") {
        receiver.name()
    } else if receiver.is("MemberExpression") && !receiver.flag("computed") {
        receiver.node("property").and_then(|property| property.name())
    } else {
        None
    };
    if named.is_some_and(|name| STREAM_NAME.is_match(&name)) {
        return Some(true);
    }
    Some(types.type_names(receiver.start(), receiver.end())?.iter().any(|name| STREAM_TYPE.is_match(name)))
}

pub fn has_encoding_evidence(text: &str) -> bool {
    ENCODED.is_match(text) || STRING_ENCODING.is_match(text)
}

pub fn yields_strings(context: &Context, scopes: &Scopes, receiver: Node) -> bool {
    let definition = if receiver.is("Identifier") { scopes.variable_named(receiver).and_then(|symbol| scopes.defs(symbol).into_iter().next()) } else { None };
    let origin = match definition {
        Some(definition) if definition.node.is("VariableDeclarator") => definition.node.node("init"),
        _ => Some(receiver),
    };
    let callee = origin.filter(|origin| origin.is("CallExpression")).and_then(|origin| origin.node("callee"));
    callee.is_some_and(|callee| context.file.slice(callee.start(), callee.end()) == "Readable.from")
}

pub fn is_binary_or_untyped_stream(context: &Context, scopes: &Scopes, types: &mut Types, chunk: &Chunk) -> Option<bool> {
    let Some(definition) = scopes.defs(chunk.variable).into_iter().next() else { return Some(false) };
    let identifier = definition.name;
    let (start, end) = (identifier.start(), identifier.end());
    if types.type_names(start, end)?.iter().any(|name| BINARY_TYPES.contains(&name.as_str())) {
        return Some(true);
    }
    if !types.is_any_or_unknown(start, end)? || !is_stream_receiver(types, chunk.receiver)? {
        return Some(false);
    }
    Some(!has_encoding_evidence(context.file.text))
}
