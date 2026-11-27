//! FindSecBugs' detectors of key material, measured on test code, each priority 2. A size is an `int` or `char`
//! constant argument from -32768 up, outside -1 to 5 (SpotBugs does not see the values javac pushes with `iconst`
//! or `ldc`); of a `?:` with two constant sides it is the second. A local that is not a constant variable is not a
//! size, and neither is the `Blowfish` name.
//! - RSA_KEY_SIZE: each `initialize(size)` or `initialize(size, random)` written against `KeyPairGenerator` itself
//!   with a size under 1024, when a call of `KeyPairGenerator.getInstance(name)` or `getInstance(name, provider
//!   name)` whose name starts with `RSA` in any case always runs before it in the method, on any generator.
//! - BLOWFISH_KEY_SIZE: once per method, on its last `init(size)` or `init(size, random)` written against
//!   `KeyGenerator` itself with a size under 128, when the method calls `KeyGenerator.getInstance` with the
//!   constant `Blowfish` as last argument, anywhere and on any generator.
//! - STATIC_IV: each `new IvParameterSpec(..)`, and the constructors of a class that extends it directly, unless
//!   the method calls `Cipher.getIV()` anywhere, or `nextBytes` on a value written as `SecureRandom` always runs
//!   before it. Once per method and line.
//!
//! A lambda is a method of its own. A call in a branch javac leaves out counts for nothing. SpotBugs' rule for a
//! call that runs before is looser than "always" in places (#2778).
mod before;

use super::super::idioms::Compiled;
use super::super::idioms::encoding::written_owner;
use super::super::statements::random::super_calls;
use super::super::taint::lines::line as invoke_line;
use super::super::{Context, place};
use super::values::{Held, held};
use crate::engine::source::{children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::constant::Constant;
use crate::java::types::expr::{Binding, unwrap};
use tree_sitter::Node;

pub const RSA_SIZE: &str = "RSA_KEY_SIZE";
pub const BLOWFISH_SIZE: &str = "BLOWFISH_KEY_SIZE";
pub const STATIC_IV: &str = "STATIC_IV";

const PAIRS: &str = "java.security.KeyPairGenerator";
const KEYS: &str = "javax.crypto.KeyGenerator";
const SPEC: &str = "javax.crypto.spec.IvParameterSpec";

fn arguments(node: Node) -> Vec<Node> {
    node.child_by_field_name("arguments").map(|arguments| children(arguments).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")).collect()).unwrap_or_default()
}

/// The parameter types of the method a call of one of the class's methods with this name runs.
fn called(context: &Context, node: Node, class: &str, name: &str) -> Option<Vec<String>> {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|written| context.text(written) != name) {
        return None;
    }
    let call = context.resolver.resolve_call(node).filter(|call| call.declaring == class)?;
    Some(call.method.parameters.iter().map(|parameter| parameter.name().to_string()).collect())
}

/// The value a `final` local with a constant value gives, which javac writes in place of every read.
pub fn constant_variable<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    let node = unwrap(node);
    if node.kind() != "identifier" || !matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Local(_))) {
        return None;
    }
    let name = context.text(node);
    let mut at = node;
    while let Some(holder) = parent(at) {
        let declared = children(holder).into_iter().filter(|part| part.kind() == "local_variable_declaration" && part.end_byte() <= node.start_byte() && has_modifier(*part, "final"));
        let value = declared.flat_map(declarators).filter(|declarator| declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name)).last();
        if let Some(declarator) = value {
            return declarator.child_by_field_name("value");
        }
        at = holder;
    }
    None
}

/// The constant SpotBugs sees last: of a `?:` with two constant sides and a condition that is not constant, the
/// one javac writes last.
fn number(context: &Context, node: Node) -> Option<Constant> {
    let node = unwrap(node);
    if node.kind() == "ternary_expression"
        && node.child_by_field_name("condition").is_some_and(|condition| context.resolver.constant_boolean(condition).is_none())
        && let (Some(one), Some(other)) = (node.child_by_field_name("consequence"), node.child_by_field_name("alternative"))
        && number(context, one).is_some()
    {
        return number(context, other);
    }
    context.resolver.constant_number(unwrap(node)).or_else(|| constant_variable(context, node).and_then(|value| context.resolver.constant_number(unwrap(value))))
}

fn string(context: &Context, node: Node) -> Option<String> {
    context.resolver.constant_string(unwrap(node)).or_else(|| constant_variable(context, node).and_then(|value| context.resolver.constant_string(unwrap(value))))
}

fn size(context: &Context, node: Node, below: i64, parameters: &[String]) -> bool {
    let fits = matches!(parameters, [one] if one == "int") || matches!(parameters, [one, two] if one == "int" && two == "java.security.SecureRandom");
    let value = arguments(node).first().and_then(|first| number(context, *first));
    let value = match value {
        Some(Constant::Int(value)) => i64::from(value),
        Some(Constant::Char(value)) => i64::from(value),
        _ => return false,
    };
    fits && !(-1..=5).contains(&value) && (-32768..below).contains(&value)
}

/// Whether the call is written against the class itself, not a subclass.
fn written(context: &Context, own: &str, node: Node, class: &str) -> bool {
    written_owner(context, own, node).as_deref() == Some(class)
}

fn rsa(context: &Context, node: Node) -> bool {
    let Some(parameters) = called(context, node, PAIRS, "getInstance") else { return false };
    let named = matches!(&parameters[..], [one] if one == "java.lang.String") || matches!(&parameters[..], [one, two] if one == "java.lang.String" && two == "java.lang.String");
    named && arguments(node).first().is_some_and(|first| matches!(held(context, *first), Held::Text(text) if text.get(..3).is_some_and(|start| start.eq_ignore_ascii_case("RSA"))))
}

fn blowfish(context: &Context, node: Node) -> bool {
    called(context, node, KEYS, "getInstance").is_some() && arguments(node).last().and_then(|last| string(context, *last)).as_deref() == Some("Blowfish")
}

fn spec(context: &Context, node: Node) -> bool {
    node.kind() == "object_creation_expression" && node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).is_some_and(|made| made.name() == SPEC)
}

fn report(context: &Context, pattern: &'static str, at: Node, line: usize, label: &str, seen: &mut Vec<(&'static str, usize)>) {
    if seen.contains(&(pattern, line)) {
        return;
    }
    seen.push((pattern, line));
    let message = match pattern {
        RSA_SIZE => "RSA usage with a short key",
        BLOWFISH_SIZE => "Blowfish usage with a short encryption key",
        _ => "The initialization vector (IV) is not properly generated",
    };
    context.report_listed(pattern, at, line, message.to_string(), place::function(label), 2, Vec::new());
}

fn method(context: &Context, own: &str, method: &Compiled) {
    let nodes = &method.nodes;
    let mut seen = Vec::new();
    let pairs: Vec<Node> = nodes.iter().copied().filter(|node| rsa(context, *node)).collect();
    for node in nodes.iter().copied() {
        let sized = called(context, node, PAIRS, "initialize").is_some_and(|parameters| size(context, node, 1024, &parameters));
        if sized && written(context, own, node, PAIRS) && before::always(context, &pairs, node) {
            report(context, RSA_SIZE, node, invoke_line(context, node), &method.label, &mut seen);
        }
    }
    if nodes.iter().any(|node| blowfish(context, *node)) {
        let short = nodes.iter().copied().filter(|node| called(context, *node, KEYS, "init").is_some_and(|parameters| size(context, *node, 128, &parameters)) && written(context, own, *node, KEYS));
        if let Some(last) = short.max_by_key(Node::start_byte) {
            report(context, BLOWFISH_SIZE, last, invoke_line(context, last), &method.label, &mut seen);
        }
    }
    if nodes.iter().any(|node| called(context, *node, "javax.crypto.Cipher", "getIV").is_some() && !before::dead(context, *node)) {
        return;
    }
    let random = |node: &Node| node.kind() == "method_invocation" && node.child_by_field_name("name").is_some_and(|name| context.text(name) == "nextBytes") && written_owner(context, own, *node).as_deref() == Some("java.security.SecureRandom");
    let filled: Vec<Node> = nodes.iter().copied().filter(random).filter(|node| !before::dead(context, *node)).collect();
    for node in nodes.iter().copied().filter(|node| spec(context, *node)) {
        if !before::always(context, &filled, node) {
            report(context, STATIC_IV, node, invoke_line(context, node), &method.label, &mut seen);
        }
    }
}

pub fn check<'a>(context: &Context<'a>, own: &str, class: Node<'a>, methods: &[Compiled<'a>]) {
    for (at, label) in super_calls(context, class, SPEC) {
        report(context, STATIC_IV, at, context.line(at), &label, &mut Vec::new());
    }
    for compiled in methods {
        method(context, own, compiled);
    }
}
