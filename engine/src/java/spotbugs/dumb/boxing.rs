//! The string and boxing calls of DumbMethods, measured on test code. Each is reported once per method, and the
//! parsing and compare patterns once per method and box class:
//! - DM_STRING_CTOR `new String(String)`, DM_STRING_VOID_CTOR `new String()`, DM_BOOLEAN_CTOR any `new Boolean(…)`:
//!   priority 2, on the line of the constructor call javac writes (after the arguments).
//! - DM_BOXED_PRIMITIVE_FOR_PARSING: `Integer`, `Long`, `Double` or `Float` `.valueOf(String)` unboxed right away
//!   to its own primitive (`xValue()` of that type, a primitive context, an operand); priority 1, on the line
//!   of the `xValue()` call, else of the `valueOf` call. `Short`, `Byte`, `Boolean`, a radix and
//!   `Integer.valueOf(s).longValue()` are not.
//! - DM_BOXED_PRIMITIVE_TOSTRING: `toString()` on `Integer.valueOf(int)` or a cast of an `int` (priority 1), or on
//!   `new Box(primitive)` of any box (priority 2), on the `toString` call's line.
//! - DM_BOXED_PRIMITIVE_FOR_COMPARE: `compareTo` of a box whose receiver was boxed from a primitive (by `valueOf`, a
//!   cast or a local that holds only boxed primitives, not `new`) and whose argument is a primitive or boxed one;
//!   priority 1, `Byte` 2, `Boolean` 3; on the `compareTo` call's line.
//! - DM_NEW_FOR_GETCLASS: `getClass()` on a `new` object (not an array); priority 2, on the call's line.
//! - DM_STRING_TOSTRING is priority 3 only, which `-medium` hides. Of two findings of a method the better
//!   priority is kept.
use super::super::observed::local_values;
use super::super::taint::lines::line as invoke_line;
use super::super::idioms::Compiled;
use super::super::{Context, names, place};
use crate::engine::source::{named_children, parent};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

pub const STRING_CTOR: &str = "DM_STRING_CTOR";
pub const STRING_VOID_CTOR: &str = "DM_STRING_VOID_CTOR";
pub const BOOLEAN_CTOR: &str = "DM_BOOLEAN_CTOR";
pub const PARSING: &str = "DM_BOXED_PRIMITIVE_FOR_PARSING";
pub const TOSTRING: &str = "DM_BOXED_PRIMITIVE_TOSTRING";
pub const COMPARE: &str = "DM_BOXED_PRIMITIVE_FOR_COMPARE";
pub const GETCLASS: &str = "DM_NEW_FOR_GETCLASS";
pub const STRING_TOSTRING: &str = "DM_STRING_TOSTRING";
pub const PATTERNS: &[&str] = &[STRING_CTOR, STRING_VOID_CTOR, BOOLEAN_CTOR, PARSING, TOSTRING, COMPARE, GETCLASS, STRING_TOSTRING];

const BOXES: &[(&str, &str)] = &[
    ("int", "java.lang.Integer"),
    ("long", "java.lang.Long"),
    ("short", "java.lang.Short"),
    ("byte", "java.lang.Byte"),
    ("char", "java.lang.Character"),
    ("boolean", "java.lang.Boolean"),
    ("float", "java.lang.Float"),
    ("double", "java.lang.Double"),
];
const PARSED: &[(&str, &str, &str)] = &[
    ("java.lang.Integer", "int", "parseInt"),
    ("java.lang.Long", "long", "parseLong"),
    ("java.lang.Double", "double", "parseDouble"),
    ("java.lang.Float", "float", "parseFloat"),
];
const STRING: &str = "java.lang.String";

#[derive(PartialEq)]
enum Boxed {
    ValueOf,
    Created,
}

fn primitive_of(boxed: &str) -> Option<&'static str> {
    BOXES.iter().find(|(_, other)| *other == boxed).map(|(kind, _)| *kind)
}

fn primitive(context: &Context, node: Node) -> Option<&'static str> {
    match context.resolver.type_of(node)? {
        Type::Primitive(kind) if kind != "void" => Some(kind),
        _ => None,
    }
}

fn arguments(node: Node) -> Vec<Node> {
    node.child_by_field_name("arguments").map(|list| named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()).unwrap_or_default()
}

fn named<'a>(context: &'a Context, node: Node) -> Option<&'a str> {
    (node.kind() == "method_invocation").then(|| node.child_by_field_name("name").map(|name| context.text(name))).flatten()
}

fn static_call(context: &Context, node: Node, name: &str) -> Option<(String, Vec<Type>)> {
    if named(context, node) != Some(name) {
        return None;
    }
    let call = context.resolver.resolve_call(node)?;
    call.method.is_static.then_some((call.declaring, call.method.parameters))
}

/// How a value of the box type was made from a primitive, if it was.
fn boxed_from(context: &Context, node: Node, boxed: &str, locals: bool) -> Option<Boxed> {
    let node = unwrap(node);
    let wanted = primitive_of(boxed)?;
    match node.kind() {
        "method_invocation" => {
            let (declaring, parameters) = static_call(context, node, "valueOf")?;
            (declaring == boxed && matches!(parameters[..], [Type::Primitive(kind)] if kind == wanted)).then_some(Boxed::ValueOf)
        }
        "cast_expression" => {
            let to = node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind))?;
            let from = node.child_by_field_name("value").and_then(|value| primitive(context, value));
            (to.name() == boxed && from.is_some()).then_some(Boxed::ValueOf)
        }
        "object_creation_expression" => {
            let call = context.resolver.resolve_constructor(node)?;
            (call.declaring == boxed && matches!(call.method.parameters[..], [Type::Primitive(_)])).then_some(Boxed::Created)
        }
        "identifier" if locals => {
            let held = local_values(context, node, context.text(node));
            let all = !held.is_empty() && held.iter().all(|value| primitive(context, unwrap(*value)).is_some() || boxed_from(context, *value, boxed, false) == Some(Boxed::ValueOf));
            all.then_some(Boxed::ValueOf)
        }
        _ => None,
    }
}

fn holder(node: Node) -> Option<(Node, Node)> {
    let mut inner = node;
    let mut above = parent(node)?;
    while above.kind() == "parenthesized_expression" {
        inner = above;
        above = parent(above)?;
    }
    Some((above, inner))
}

/// Whether javac unboxes the value of an expression of a box type right after computing it.
fn unboxed_at_once(context: &Context, node: Node, kind: &str) -> bool {
    let Some((above, inner)) = holder(node) else { return false };
    match above.kind() {
        "method_invocation" => {
            let on = above.child_by_field_name("object").is_some_and(|object| object.id() == inner.id());
            on && named(context, above) == Some(&format!("{kind}Value")) && arguments(above).is_empty()
        }
        "binary_expression" => {
            let operator = above.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
            let text = context.resolver.type_of(above).is_some_and(|kind| kind.name() == STRING);
            let other = [above.child_by_field_name("left"), above.child_by_field_name("right")].into_iter().flatten().find(|side| side.id() != inner.id());
            let reference = matches!(operator, "==" | "!=") && other.is_some_and(|other| primitive(context, other).is_none());
            !text && !reference
        }
        "unary_expression" => true,
        "array_access" => above.child_by_field_name("index").is_some_and(|index| index.id() == inner.id()),
        _ => matches!(context.resolver.expected(node), Some(Type::Primitive(_))),
    }
}

fn call_line(context: &Context, node: Node) -> usize {
    node.child_by_field_name("arguments").map_or_else(|| context.line(node), |arguments| context.line(arguments))
}

fn short(boxed: &str) -> &str {
    boxed.trim_start_matches("java.lang.")
}

struct Found {
    pattern: &'static str,
    key: String,
    line: usize,
    priority: u8,
    called: Option<String>,
    arguments: Option<Vec<String>>,
}

fn creation(context: &Context, node: Node) -> Option<Found> {
    if node.kind() != "object_creation_expression" {
        return None;
    }
    let call = context.resolver.resolve_constructor(node)?;
    let pattern = match (call.declaring.as_str(), &call.method.parameters[..]) {
        (STRING, [Type::Class(parameter, _)]) if parameter == STRING => STRING_CTOR,
        (STRING, []) => STRING_VOID_CTOR,
        ("java.lang.Boolean", _) => BOOLEAN_CTOR,
        _ => return None,
    };
    Some(Found { pattern, key: String::new(), line: invoke_line(context, node), priority: 2, called: None, arguments: None })
}

fn parsing(context: &Context, node: Node) -> Option<Found> {
    let (declaring, parameters) = static_call(context, node, "valueOf")?;
    let (_, kind, parse) = PARSED.iter().find(|(boxed, _, _)| *boxed == declaring)?;
    if !matches!(&parameters[..], [Type::Class(parameter, _)] if parameter == STRING) || !unboxed_at_once(context, node, kind) {
        return None;
    }
    let called = format!("{}.{parse}(String)", short(&declaring));
    let explicit = holder(node).filter(|(above, _)| above.kind() == "method_invocation").map(|(above, _)| above);
    let line = call_line(context, explicit.unwrap_or(node));
    Some(Found { pattern: PARSING, key: declaring, line, priority: 1, called: Some(called), arguments: None })
}

fn to_string(context: &Context, node: Node) -> Option<Found> {
    if named(context, node) != Some("toString") || !arguments(node).is_empty() {
        return None;
    }
    let object = node.child_by_field_name("object")?;
    let boxed = context.resolver.type_of(object)?.name();
    let priority = match boxed_from(context, object, &boxed, false)? {
        Boxed::ValueOf if boxed == "java.lang.Integer" => 1,
        Boxed::Created => 2,
        Boxed::ValueOf => return None,
    };
    let called = format!("{}.toString({})", short(&boxed), primitive_of(&boxed)?);
    Some(Found { pattern: TOSTRING, key: String::new(), line: call_line(context, node), priority, called: Some(called), arguments: None })
}

fn compare(context: &Context, node: Node) -> Option<Found> {
    let [argument] = arguments(node)[..] else { return None };
    if named(context, node) != Some("compareTo") {
        return None;
    }
    let object = node.child_by_field_name("object")?;
    let boxed = context.resolver.type_of(object)?.name();
    let kind = primitive_of(&boxed)?;
    let receiver = boxed_from(context, object, &boxed, true) == Some(Boxed::ValueOf);
    let explicit = boxed_from(context, argument, &boxed, false) == Some(Boxed::ValueOf);
    if !receiver || !(explicit || primitive(context, unwrap(argument)).is_some()) {
        return None;
    }
    let priority = match kind {
        "boolean" => 3,
        "byte" => 2,
        _ => 1,
    };
    let name = short(&boxed);
    let line = call_line(context, node);
    let arguments = vec![format!("{name}.compareTo({name})"), format!("{name}.compare({kind}, {kind})")];
    Some(Found { pattern: COMPARE, key: boxed.clone(), line, priority, called: Some(arguments[1].clone()), arguments: Some(arguments) })
}

fn get_class(context: &Context, node: Node) -> Option<Found> {
    let object = node.child_by_field_name("object").map(unwrap)?;
    let fits = named(context, node) == Some("getClass") && arguments(node).is_empty() && object.kind() == "object_creation_expression";
    fits.then(|| Found { pattern: GETCLASS, key: String::new(), line: call_line(context, node), priority: 2, called: None, arguments: None })
}

fn message(pattern: &str, label: &str, arguments: &[String]) -> String {
    match pattern {
        STRING_CTOR => format!("{label} invokes inefficient new String(String) constructor"),
        STRING_VOID_CTOR => format!("{label} invokes inefficient new String() constructor"),
        BOOLEAN_CTOR => format!("{label} invokes inefficient Boolean constructor; use Boolean.valueOf(...) instead"),
        PARSING => format!("Boxing/unboxing to parse a primitive {label}"),
        TOSTRING => format!("Primitive boxed just to call toString in {label}"),
        COMPARE => format!("Primitive is boxed to call {}: use {} instead", arguments[0], arguments[1]),
        _ => format!("{label} allocates an object, only to get the class object"),
    }
}

pub fn check(context: &Context, methods: &[Compiled]) {
    if !context.wants(PATTERNS) {
        return;
    }
    let finders: [fn(&Context, Node) -> Option<Found>; 5] = [creation, parsing, to_string, compare, get_class];
    for method in methods {
        let mut best: Vec<(Node, Found)> = Vec::new();
        for node in method.nodes.iter().copied().filter(|node| matches!(node.kind(), "method_invocation" | "object_creation_expression")) {
            for found in finders.iter().filter_map(|finder| finder(context, node)) {
                match best.iter_mut().find(|(_, kept)| kept.pattern == found.pattern && kept.key == found.key) {
                    Some(kept) if found.priority < kept.1.priority => *kept = (node, found),
                    Some(_) => {}
                    None => best.push((node, found)),
                }
            }
        }
        for (node, found) in best.into_iter().filter(|(_, found)| found.priority <= 2) {
            let listed = found.arguments.clone().unwrap_or_else(|| vec![method.label.clone()]);
            let text = message(found.pattern, &method.label, &listed);
            let place = match &found.called {
                Some(called) => {
                    let class = enclosing_types(context.resolver.scope, node).into_iter().next();
                    let shown = class.as_deref().map(|class| names::binary(context, class)).unwrap_or_default();
                    format!("function:{called}|{}@{shown}", names::package_of(&shown))
                }
                None => place::function(&method.label),
            };
            context.report_listed(found.pattern, node, found.line, text, place, found.priority, listed);
        }
    }
}
