//! WeakTLSDetector's SSL_CONTEXT and LdapEntryPoisoningDetector, which judge a value SpotBugs' operand stack knows
//! (constants, locals and fields as `crypto::values` follows them), measured on test code. Both are priority 2,
//! once per line.
//! - SSL_CONTEXT: `SSLContext.getInstance(protocol)` without a provider, for `SSL` in any case.
//! - LDAP_ENTRY_POISONING: `true` as the flag of `setReturningObjFlag` or the fifth argument of the six-argument
//!   constructor of `javax.naming.directory.SearchControls`, the call written against that class itself; a direct
//!   subclass calling `super(..)` counts too.
//! - COOKIE_PERSISTENT (PersistentCookieDetector): `setMaxAge(age)` written against Servlet's `Cookie` itself
//!   (`javax` or `jakarta`) with an age of a year (31536000 seconds) or more.
use super::super::Context;
use super::super::crypto::algorithms::{Hit, Use, hit};
use super::super::idioms::encoding::written_owner;
use crate::java::types::scope::TYPE_DECLARATIONS;
use crate::engine::source::ancestor;
use tree_sitter::Node;

pub const CONTEXT: &str = "SSL_CONTEXT";
pub const POISONING: &str = "LDAP_ENTRY_POISONING";
pub const PERSISTENT: &str = "COOKIE_PERSISTENT";
pub const PATTERNS: &[&str] = &[CONTEXT, POISONING, PERSISTENT];
pub const MARKS: &[&str] = &["SSLContext", "SearchControls", "setMaxAge"];
const YEAR: i64 = 31_536_000;

const CONTROLS: &str = "javax.naming.directory.SearchControls";

fn arguments(node: Node) -> Vec<Node> {
    let Some(arguments) = node.child_by_field_name("arguments") else { return Vec::new() };
    let mut cursor = arguments.walk();
    arguments.named_children(&mut cursor).filter(|part| !part.kind().ends_with("comment")).collect()
}

fn superclass(context: &Context, node: Node) -> Option<String> {
    let class = ancestor(node, TYPE_DECLARATIONS)?;
    let extended = class.child_by_field_name("superclass")?.named_child(0)?;
    context.resolver.type_node(extended).map(|kind| kind.name())
}

/// The setting a call or constructor call makes, and the argument that gives its value.
pub fn configured<'t>(context: &Context, own: &str, node: Node<'t>) -> Option<(Use, Node<'t>)> {
    let given = arguments(node);
    match node.kind() {
        "method_invocation" => {
            let name = context.text(node.child_by_field_name("name")?);
            match name {
                "getInstance" if given.len() == 1 => {
                    let call = context.resolver.resolve_call(node)?;
                    (call.declaring == "javax.net.ssl.SSLContext" && call.method.is_static).then_some((Use::Protocol, given[0]))
                }
                "setMaxAge" if given.len() == 1 && written_owner(context, own, node).is_some_and(|owner| super::super::cookies::COOKIES.contains(&owner.as_str())) => {
                    Some((Use::MaxAge, given[0]))
                }
                "setReturningObjFlag" if given.len() == 1 && written_owner(context, own, node).as_deref() == Some(CONTROLS) => Some((Use::ReturnsObjects, given[0])),
                _ => None,
            }
        }
        "object_creation_expression" if given.len() == 6 => {
            let made = context.resolver.type_node(node.child_by_field_name("type")?)?;
            (made.name() == CONTROLS).then_some((Use::ReturnsObjects, given[4]))
        }
        "explicit_constructor_invocation" if given.len() == 6 => {
            let parent_call = node.child_by_field_name("constructor").is_some_and(|called| called.kind() == "super");
            (parent_call && superclass(context, node).as_deref() == Some(CONTROLS)).then_some((Use::ReturnsObjects, given[4]))
        }
        _ => None,
    }
}

/// Whether javac writes the constant `true` for an argument: a constant expression, a `?:` with a constant test,
/// or a `final` local holding one.
pub fn constant_true(context: &Context, node: Node) -> bool {
    let node = crate::java::types::expr::unwrap(node);
    if node.kind() == "ternary_expression" {
        let test = node.child_by_field_name("condition").and_then(|condition| context.resolver.constant_boolean(condition));
        let side = test.and_then(|test| node.child_by_field_name(if test { "consequence" } else { "alternative" }));
        return side.is_some_and(|side| constant_true(context, side));
    }
    if let Some(value) = super::super::crypto::material::constant_variable(context, node) {
        return constant_true(context, value);
    }
    context.resolver.constant_boolean(node) == Some(true)
}

pub fn patterns_of(used: Use) -> &'static [&'static str] {
    match used {
        Use::Protocol => &[CONTEXT],
        Use::MaxAge => &[PERSISTENT],
        _ => &[POISONING],
    }
}

pub fn hits(used: Use, value: &str) -> Vec<Hit> {
    match used {
        Use::Protocol if value.eq_ignore_ascii_case("SSL") => vec![hit(CONTEXT, "SSLContext needs to be compatible with TLS 1.2", 2)],
        Use::ReturnsObjects if value == "true" => vec![hit(POISONING, "LDAP Entry Poisoning", 2)],
        Use::MaxAge if value.parse::<i64>().is_ok_and(|age| age >= YEAR) => vec![hit(PERSISTENT, "Cookie Set To Expire In 1 Year Or More", 2)],
        _ => Vec::new(),
    }
}
