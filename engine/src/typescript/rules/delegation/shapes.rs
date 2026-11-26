//! The syntax of a delegation: the call a method makes to a same-named method, the function it sits in, and
//! the annotations that excuse it.
use super::names::string_literal;
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::view::Node;

const WRAPPERS: &[&str] =
    &["TSNonNullExpression", "TSAsExpression", "TSTypeAssertion", "TSSatisfiesExpression", "ChainExpression"];
const FORWARDERS: &[&str] = &["call", "apply"];

pub struct Delegation<'v> {
    pub callee: Node<'v>,
    pub name: String,
}

pub fn stripped(node: Node) -> Node {
    unwrap(node, WRAPPERS)
}

fn property_name(member: Node) -> Option<String> {
    let property = member.node("property")?;
    if property.is("Identifier") && !member.flag("computed") {
        return property.name().map(|name| name.into_owned());
    }
    string_literal(property)
}

pub fn delegation_of(call: Node) -> Option<Delegation> {
    let callee = stripped(call.node("callee")?);
    if !callee.is("MemberExpression") {
        return None;
    }
    let direct = property_name(callee);
    let object = stripped(callee.node("object")?);
    if direct.as_deref().is_some_and(|name| FORWARDERS.contains(&name)) && object.is("MemberExpression") {
        return property_name(object).map(|name| Delegation { callee: object, name });
    }
    direct.map(|name| Delegation { callee, name })
}

pub fn is_this_receiver(callee: Node) -> bool {
    callee.is("MemberExpression") && callee.node("object").is_some_and(|object| stripped(object).is("ThisExpression"))
}

pub fn is_inherited_receiver(callee: Node) -> bool {
    if !callee.is("MemberExpression") {
        return false;
    }
    let Some(object) = callee.node("object").map(stripped) else { return false };
    if object.is("Super") {
        return true;
    }
    object.is("MemberExpression")
        && object.node("object").is_some_and(|inner| stripped(inner).is("ThisExpression"))
        && property_name(object).as_deref() == Some("constructor")
}

pub fn is_void_annotation(annotation: Option<Node>) -> bool {
    let Some(kind) = annotation.and_then(|annotation| annotation.node("typeAnnotation")) else { return false };
    if matches!(kind.kind(), "TSVoidKeyword" | "TSUndefinedKeyword" | "TSNeverKeyword") {
        return true;
    }
    if !kind.is("TSTypeReference") {
        return false;
    }
    let arguments = kind.node("typeArguments").map(|arguments| arguments.nodes("params")).unwrap_or_default();
    arguments.first().is_some_and(|argument| matches!(argument.kind(), "TSVoidKeyword" | "TSUndefinedKeyword"))
}

fn builds_arguments(statement: Node) -> bool {
    matches!(statement.kind(), "VariableDeclaration" | "ExpressionStatement")
}

/// The function whose last statement this is, when every statement before it only builds arguments.
pub fn enclosing_function(statement: Node) -> Option<Node> {
    let block = statement.parent().filter(|block| block.is("BlockStatement"))?;
    let owner = block.parent()?;
    let body = block.nodes("body");
    let is_function = matches!(owner.kind(), "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression");
    let last = body.last() == Some(&statement);
    (is_function && last && body[..body.len() - 1].iter().all(|earlier| builds_arguments(*earlier))).then_some(owner)
}
