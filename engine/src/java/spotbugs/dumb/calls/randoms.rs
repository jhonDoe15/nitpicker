//! Random numbers and hash codes of DumbMethods, measured on test code; each once per method and message:
//! - RV_ABSOLUTE_VALUE_OF_HASHCODE: `Math.abs(int)` or `StrictMath.abs(int)` of a `hashCode()` call (not through
//!   `super`) or `System.identityHashCode`, directly or through a local holding only those; priority 1.
//! - RV_ABSOLUTE_VALUE_OF_RANDOM_INT: the same of `nextInt()` or `nextLong()` written against `java.util.Random`
//!   or `java.security.SecureRandom`; priority 1.
//! - RV_REM_OF_HASHCODE / RV_REM_OF_RANDOM_INT: `int` `%` of such a value whose result is an array index or the
//!   index of `get`, `set`, `remove` or `add` written against `List`, `ArrayList` or `LinkedList`, directly or
//!   through a local stored once and read without a branch in between; priority 1.
//! - DM_NEXTINT_VIA_NEXTDOUBLE: `(int)` of a product with `nextDouble()` of `java.util.Random` or `Math.random()`
//!   itself; priority 2.
//! - RV_01_TO_INT: `(int)`, `(short)`, `(byte)` or `(char)` of `nextDouble()` or `nextFloat()` of
//!   `java.util.Random` or `Math.random()`, directly or through a local holding only those; priority 1.
//! Each is on the line of the call's `(`, or the line in effect at the remainder or cast.
use super::super::super::Context;
use super::super::super::idioms::encoding::written_owner;
use super::super::found::{Found, Findings};
use super::super::numbers::values::{held, operator, primitive, stores, text_constant};
use crate::engine::source::{ancestor, named_children, parent, walk};
use crate::java::spotbugs::taint::lines::after;
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub const ABS_HASH: &str = "RV_ABSOLUTE_VALUE_OF_HASHCODE";
pub const ABS_RANDOM: &str = "RV_ABSOLUTE_VALUE_OF_RANDOM_INT";
pub const REM_HASH: &str = "RV_REM_OF_HASHCODE";
pub const REM_RANDOM: &str = "RV_REM_OF_RANDOM_INT";
pub const NEXT_INT: &str = "DM_NEXTINT_VIA_NEXTDOUBLE";
pub const ZERO_TO_INT: &str = "RV_01_TO_INT";
pub const PATTERNS: &[&str] = &[ABS_HASH, ABS_RANDOM, REM_HASH, REM_RANDOM, NEXT_INT, ZERO_TO_INT];

const RANDOM: &str = "java.util.Random";
const LISTS: &[&str] = &["java.util.List", "java.util.ArrayList", "java.util.LinkedList"];

pub fn arguments(node: Node) -> Vec<Node> {
    node.child_by_field_name("arguments").map(|list| named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()).unwrap_or_default()
}

fn named<'a>(context: &'a Context, node: Node) -> &'a str {
    if node.kind() != "method_invocation" {
        return "";
    }
    node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

pub fn call_line(context: &Context, node: Node) -> usize {
    node.child_by_field_name("arguments").map_or_else(|| context.line(node), |arguments| context.line(arguments))
}

/// The class a static call is declared in.
pub fn static_of(context: &Context, node: Node) -> Option<String> {
    let call = context.resolver.resolve_call(node)?;
    call.method.is_static.then_some(call.declaring)
}

#[derive(Clone, Copy, PartialEq)]
enum Signed {
    Hash,
    Random,
}

/// Whether `hashCode()` is written against a class (not an interface) and not on a string constant.
fn class_hash(context: &Context, own: &str, call: Node) -> bool {
    let object = call.child_by_field_name("object").map(unwrap);
    if object.is_some_and(|object| object.kind() == "super" || text_constant(context, object).is_some()) {
        return false;
    }
    let receiver = match object {
        Some(object) if object.kind() != "this" => context.resolver.type_of(object).map(|kind| kind.erased()),
        _ => Some(Type::class(own)),
    };
    match receiver {
        Some(Type::Class(class, _)) => !context.resolver.index.get(&class).is_some_and(|info| info.is_interface),
        _ => true,
    }
}

fn signed(context: &Context, own: &str, node: Node, depth: usize) -> Option<Signed> {
    let node = unwrap(node);
    if depth > 6 {
        return None;
    }
    let bare = arguments(node).is_empty();
    match named(context, node) {
        "hashCode" if bare && class_hash(context, own, node) => return Some(Signed::Hash),
        "identityHashCode" if static_of(context, node).as_deref() == Some("java.lang.System") => return Some(Signed::Hash),
        "nextInt" | "nextLong" if bare => {
            let owner = written_owner(context, own, node)?;
            return matches!(owner.as_str(), RANDOM | "java.security.SecureRandom").then_some(Signed::Random);
        }
        _ => {}
    }
    match node.kind() {
        "cast_expression" => {
            let to = node.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
            let value = node.child_by_field_name("value")?;
            matches!(to, "int" | "short").then(|| signed(context, own, value, depth + 1)).flatten()
        }
        "assignment_expression" if operator(context, node) == "=" => signed(context, own, node.child_by_field_name("right")?, depth + 1),
        "update_expression" => {
            let postfix = node.named_child(0).filter(|first| first.kind() == "identifier" && first.start_byte() == node.start_byte())?;
            signed(context, own, postfix, depth + 1)
        }
        "identifier" => {
            let kind = signed(context, own, first_value(context, node)?, depth + 1)?;
            held(context, node, depth, &|value, depth| signed(context, own, value, depth) == Some(kind)).then_some(kind)
        }
        _ => None,
    }
}

fn first_value<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    let store = *stores(context, node, context.text(node)).last()?;
    match store.kind() {
        "variable_declarator" => store.child_by_field_name("value"),
        "assignment_expression" if operator(context, store) == "=" => store.child_by_field_name("right"),
        _ => None,
    }
}

/// `nextDouble()` or `nextFloat()` of `Random`, or `Math.random()`.
fn unit(context: &Context, own: &str, node: Node, floats: bool) -> bool {
    let node = unwrap(node);
    let bare = arguments(node).is_empty();
    match named(context, node) {
        "random" => bare && static_of(context, node).as_deref() == Some("java.lang.Math"),
        "nextDouble" => bare && written_owner(context, own, node).as_deref() == Some(RANDOM),
        "nextFloat" => floats && bare && written_owner(context, own, node).as_deref() == Some(RANDOM),
        _ => false,
    }
}

/// Parentheses, a unary `+` and casts to `int` or `short`, which keep the value SpotBugs tracks.
fn transparent(context: &Context, node: Node) -> bool {
    match node.kind() {
        "parenthesized_expression" => true,
        "unary_expression" => operator(context, node) == "+",
        "cast_expression" => matches!(node.child_by_field_name("type").map(|kind| context.text(kind)), Some("int" | "short")),
        _ => false,
    }
}

fn indexes(context: &Context, own: &str, value: Node) -> bool {
    let mut inner = value;
    let mut above = parent(value);
    while let Some(node) = above.filter(|node| transparent(context, *node)) {
        inner = node;
        above = parent(node);
    }
    let Some(above) = above else { return false };
    if above.kind() == "array_access" {
        return above.child_by_field_name("index").is_some_and(|index| index.id() == inner.id());
    }
    let Some(call) = parent(above).filter(|call| above.kind() == "argument_list" && call.kind() == "method_invocation") else { return false };
    let listed = arguments(call);
    let fits = match (named(context, call), listed.len()) {
        ("get" | "remove", 1) | ("set" | "add", 2) => listed.first().is_some_and(|first| first.id() == inner.id()),
        _ => false,
    };
    let int = context.resolver.resolve_call(call).is_some_and(|resolved| matches!(resolved.method.parameters.first(), Some(Type::Primitive("int"))));
    fits && int && written_owner(context, own, call).is_some_and(|owner| LISTS.contains(&owner.as_str()))
}

/// Whether a local is compared before a use: SpotBugs then no longer takes it for a signed value.
fn compared(context: &Context, name: &str, store: Node, usage: Node, body: Node) -> bool {
    let mut found = false;
    walk(body, |node| {
        let between = node.start_byte() >= store.end_byte() && node.end_byte() <= usage.start_byte();
        if found || !between || node.kind() != "binary_expression" || !matches!(operator(context, node), "<" | "<=" | ">" | ">=" | "==" | "!=") {
            return;
        }
        found = ["left", "right"].iter().any(|side| node.child_by_field_name(side).map(unwrap).is_some_and(|side| side.kind() == "identifier" && context.text(side) == name));
    });
    found
}

/// Whether a value is used as an index, directly or through locals each stored once and never compared.
fn flows_to_index(context: &Context, own: &str, value: Node, depth: usize) -> bool {
    if depth > 4 {
        return false;
    }
    if indexes(context, own, value) {
        return true;
    }
    let mut store = value;
    while let Some(above) = parent(store).filter(|above| transparent(context, *above)) {
        store = above;
    }
    let Some(holder) = parent(store) else { return false };
    let name = match holder.kind() {
        "variable_declarator" => holder.child_by_field_name("name"),
        "assignment_expression" if operator(context, holder) == "=" => holder.child_by_field_name("left").filter(|left| left.kind() == "identifier"),
        _ => None,
    };
    let value_side = holder.child_by_field_name("value").or_else(|| holder.child_by_field_name("right"));
    let Some(name) = name.filter(|_| value_side.is_some_and(|side| side.id() == store.id())).map(|name| context.text(name)) else { return false };
    let Some(body) = ancestor(holder, super::super::super::observed::BODIES) else { return false };
    let mut used = false;
    walk(body, |node| {
        if used || node.kind() != "identifier" || context.text(node) != name || node.start_byte() < holder.end_byte() {
            return;
        }
        let only = matches!(stores(context, node, name)[..], [single] if single.id() == holder.id());
        used = only && !compared(context, name, holder, node, body) && flows_to_index(context, own, node, depth + 1);
    });
    used
}

/// A `double` local holding only values from 0 to 1 (SpotBugs does not follow `float` locals).
fn held_unit(context: &Context, own: &str, node: Node, floats: bool) -> bool {
    let node = unwrap(node);
    node.kind() == "identifier" && primitive(context, node) == Some("double") && held(context, node, 0, &|value, _| unit(context, own, value, floats))
}

/// The value under casts to `double` or `float`.
fn through_floats<'t>(context: &Context, mut node: Node<'t>) -> Node<'t> {
    node = unwrap(node);
    while node.kind() == "cast_expression" && matches!(node.child_by_field_name("type").map(|kind| context.text(kind)), Some("double" | "float")) {
        let Some(value) = node.child_by_field_name("value") else { break };
        node = unwrap(value);
    }
    node
}

pub fn check<'a>(context: &Context<'a>, own: &str, node: Node<'a>, label: &str, found: &mut Findings<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let mut add = |pattern, priority, message: String| {
        let line = if node.kind() == "method_invocation" { call_line(context, node) } else { after(context, node) };
        found.add(Found { pattern, node, line, priority, message, place: None, arguments: vec![label.to_string()] });
    };
    match node.kind() {
        "method_invocation" if named(context, node) == "abs" => {
            let math = static_of(context, node).is_some_and(|class| matches!(class.as_str(), "java.lang.Math" | "java.lang.StrictMath"));
            let [argument] = arguments(node)[..] else { return };
            let parameter = context.resolver.resolve_call(node).and_then(|call| call.method.parameters.first().cloned());
            match (math, parameter, signed(context, own, argument, 0)) {
                (true, Some(Type::Primitive("int")), Some(Signed::Hash)) => add(ABS_HASH, 1, format!("Bad attempt to compute absolute value of signed 32-bit hashcode in {label}")),
                (true, Some(Type::Primitive("int" | "long")), Some(Signed::Random)) => add(ABS_RANDOM, 1, format!("Bad attempt to compute absolute value of signed random integer in {label}")),
                _ => {}
            }
        }
        "binary_expression" if operator(context, node) == "%" && primitive(context, node) == Some("int") => {
            let Some(left) = node.child_by_field_name("left") else { return };
            let Some(kind) = signed(context, own, left, 0) else { return };
            if flows_to_index(context, own, node, 0) {
                match kind {
                    Signed::Hash => add(REM_HASH, 1, format!("Remainder of hashCode could be negative in {label}")),
                    Signed::Random => add(REM_RANDOM, 1, format!("Remainder of 32-bit signed random integer computed in {label}")),
                }
            }
        }
        "cast_expression" => {
            let to = node.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
            let Some(value) = node.child_by_field_name("value").map(unwrap) else { return };
            let product = value.kind() == "binary_expression" && operator(context, value) == "*" && primitive(context, value) == Some("double");
            let sides: Vec<Node> = [value.child_by_field_name("left"), value.child_by_field_name("right")].into_iter().flatten().collect();
            let doubles = |side: Node| unit(context, own, side, false) || held_unit(context, own, side, false);
            let calls = sides.iter().filter(|side| named(context, unwrap(**side)) == "nextDouble").count();
            if to == "int" && product && calls < 2 && sides.iter().any(|side| doubles(*side)) {
                add(NEXT_INT, 2, format!("{label} uses the nextDouble method of Random to generate a random integer; using nextInt is more efficient"));
            }
            let inner = through_floats(context, value);
            let long_random = to == "int" && named(context, inner) == "nextLong" && signed(context, own, inner, 0) == Some(Signed::Random);
            let random = unit(context, own, inner, true) || held_unit(context, own, inner, false) || long_random;
            if matches!(to, "int" | "short" | "byte" | "char") && random {
                add(ZERO_TO_INT, 1, format!("{label} uses generates a random value from 0 to 1 and then coerces that value to the integer 0"));
            }
        }
        _ => {}
    }
}
