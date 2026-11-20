//! Rules for React component tests. Each runs only in the files the preset counts as React tests.
pub mod hover_test_needs_keyboard;
pub mod no_implementation_details;
mod react_names;
mod wrappers;

use super::support::view::Node;
use super::testing_library::nodes::string_literal;

/// An identifier's name or a string literal's value; through `as`, the literal type when there is one.
fn static_name(node: Node) -> Option<String> {
    let plain = |node: Node| if node.is("Identifier") { node.name().map(|name| name.into_owned()) } else { string_literal(Some(node)) };
    if !node.is("TSAsExpression") {
        return plain(node);
    }
    let literal = node.node("typeAnnotation").filter(|annotation| annotation.is("TSLiteralType")).and_then(|annotation| annotation.node("literal"));
    literal.and_then(|literal| string_literal(Some(literal))).or_else(|| node.node("expression").and_then(plain))
}

/// The property a member expression names, when it can be read from the source.
fn member_name(member: Node) -> Option<String> {
    let property = member.node("property")?;
    if member.flag("computed") { static_name(property) } else { property.name().map(|name| name.into_owned()) }
}

fn is_hook_name(name: &str) -> bool {
    name.strip_prefix("use").and_then(|rest| rest.chars().next()).is_some_and(|first| first.is_ascii_uppercase())
}
