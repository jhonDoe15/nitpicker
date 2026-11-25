//! Whether a promise is handled, function names and the scope questions of the plugin's node helpers.
use super::nodes::{
    bindings, closest_call, deepest_identifier, identifier, is_function, is_kind, is_named, name, property_name,
};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const PROMISE_MATCHERS: [&str; 10] = [
    "resolves", "rejects", "toResolve", "toReject", "toBeRejected", "toBeRejectedWith", "toBeRejectedWithError", "toBePending",
    "toBeResolved", "toBeResolvedTo",
];

fn has_promise_handler(node: Option<Node>) -> bool {
    node.is_some_and(|node| {
        node.is("MemberExpression") && identifier(node.node("property")).is_some_and(|property| matches!(name(property).as_str(), "then" | "catch" | "finally"))
    })
}

fn has_chained_handler(node: Node) -> bool {
    let parent = node.parent();
    match parent {
        Some(call) if call.is("CallExpression") && call.parent().is_some() => has_promise_handler(call.parent()),
        _ => has_promise_handler(parent),
    }
}

fn is_promise_group(call: Node) -> bool {
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    is_named(callee.node("object"), "Promise") && (is_named(callee.node("property"), "all") || is_named(callee.node("property"), "allSettled"))
}

fn in_resolved_array(node: Node) -> bool {
    let Some(array) = closest_call(node, true).and_then(|call| call.parent()).filter(|parent| parent.is("ArrayExpression")) else { return false };
    array.parent().is_some_and(|call| call.is("CallExpression") && is_promise_group(call))
}

fn expect_handles_promise(node: Node) -> bool {
    let mut current = node;
    loop {
        let callee = identifier(current.node("callee")).filter(|_| current.is("CallExpression"));
        let member = current.parent().filter(|parent| parent.is("MemberExpression"));
        if let (Some(callee), Some(member)) = (callee, member)
            && matches!(name(callee).as_str(), "expect" | "expectAsync")
        {
            return identifier(member.node("property")).is_some_and(|matcher| PROMISE_MATCHERS.contains(&name(matcher).as_str()));
        }
        match current.parent() {
            Some(parent) => current = parent,
            None => return false,
        }
    }
}

fn root_expression(mut expression: Node) -> Node {
    loop {
        let Some(parent) = expression.parent() else { return expression };
        match parent.kind() {
            "ConditionalExpression" | "ChainExpression" => expression = parent,
            "LogicalExpression" => match parent.text("operator").as_deref() {
                Some("??" | "||") => expression = parent,
                Some("&&") if parent.node("right") == Some(expression) => expression = parent,
                _ => return expression,
            },
            "SequenceExpression" if parent.nodes("expressions").last() == Some(&expression) => expression = parent,
            _ => return expression,
        }
    }
}

pub fn is_promise_handled(node: Node) -> bool {
    let root = closest_call(node, true).map(root_expression);
    [Some(node), root].into_iter().flatten().any(|candidate| {
        let Some(parent) = candidate.parent() else { return false };
        matches!(parent.kind(), "AwaitExpression" | "ArrowFunctionExpression" | "ReturnStatement")
            || expect_handles_promise(parent)
            || has_chained_handler(candidate)
            || in_resolved_array(candidate)
    })
}

fn quoted_word(text: &str) -> String {
    let bytes = text.as_bytes();
    for (start, byte) in bytes.iter().enumerate() {
        if *byte != b'\'' {
            continue;
        }
        let word = bytes[start + 1..].iter().take_while(|byte| byte.is_ascii_alphanumeric() || **byte == b'_').count();
        if word > 0 && bytes.get(start + 1 + word) == Some(&b'\'') {
            return text[start + 1..start + 1 + word].to_string();
        }
    }
    String::new()
}

/// `getFunctionName`: the quoted word in what eslint-utils' `getFunctionNameWithKind` says, or nothing.
pub fn function_name(function: Node) -> String {
    let Some(parent) = function.parent() else { return String::new() };
    let is_value = parent.node("value") == Some(function);
    let keyed = is_value && matches!(parent.kind(), "Property" | "MethodDefinition" | "PropertyDefinition");
    if keyed && !parent.is("PropertyDefinition") && parent.text("kind").as_deref() == Some("constructor") {
        return String::new();
    }
    let found = if keyed {
        if is_kind(parent.node("key"), "PrivateIdentifier") { None } else { property_name(parent) }
    } else if let Some(id) = function.node("id") {
        Some(name(id))
    } else if parent.is("VariableDeclarator") && identifier(parent.node("id")).is_some() {
        parent.node("id").map(name)
    } else if matches!(parent.kind(), "AssignmentExpression" | "AssignmentPattern") && identifier(parent.node("left")).is_some() {
        parent.node("left").map(name)
    } else if parent.is("ExportDefaultDeclaration") && parent.node("declaration") == Some(function) {
        Some("default".to_string())
    } else {
        None
    };
    found.map(|found| quoted_word(&format!("'{found}'"))).unwrap_or_default()
}

fn declares_block_scope(statement: Node, field: &str) -> bool {
    statement.node(field).is_some_and(|declared| declared.is("VariableDeclaration") && declared.text("kind").as_deref() != Some("var"))
}

fn opens_scope(node: Node) -> bool {
    match node.kind() {
        "BlockStatement" => !node.parent().is_some_and(|parent| is_function(parent) || matches!(parent.kind(), "TSDeclareFunction" | "TSEmptyBodyFunctionExpression")),
        "ForStatement" => declares_block_scope(node, "init"),
        "ForInStatement" | "ForOfStatement" => declares_block_scope(node, "left"),
        "TSTypeAliasDeclaration" | "TSInterfaceDeclaration" => node.node("typeParameters").is_some(),
        "CatchClause" | "SwitchStatement" | "ClassDeclaration" | "ClassExpression" | "StaticBlock" | "TSModuleDeclaration" | "TSEnumDeclaration"
        | "WithStatement" | "TSConditionalType" | "TSMappedType" | "TSFunctionType" | "TSConstructorType" | "TSCallSignatureDeclaration"
        | "TSConstructSignatureDeclaration" | "TSMethodSignature" | "TSDeclareFunction" | "TSEmptyBodyFunctionExpression" | "Program" => true,
        _ => false,
    }
}

/// `getInnermostFunctionScope`: the function whose scope is the innermost one around the node.
fn innermost_function(node: Node) -> Option<Node> {
    node.ancestors().find(|ancestor| is_function(*ancestor) || opens_scope(*ancestor)).filter(|found| is_function(*found))
}

fn returned(function: Node) -> Option<Node> {
    let body = function.node("body")?;
    if body.is("BlockStatement") {
        return body.nodes("body").into_iter().find(|statement| statement.is("ReturnStatement"))?.node("argument");
    }
    Some(body)
}

/// `getInnermostReturningFunction`: the function around the identifier that returns a call of that name.
pub fn returning_function(node: Node) -> Option<Node> {
    let function = innermost_function(node)?;
    let result = deepest_identifier(returned(function))?;
    (name(result) == name(node)).then_some(function)
}

/// `getVariableReferences`: for a declarator, the identifiers that refer to its first variable, the first one left out.
pub fn variable_references<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>) -> Vec<Node<'v>> {
    if !node.is("VariableDeclarator") {
        return Vec::new();
    }
    let Some(symbol) = bindings(node).first().and_then(|first| scopes.variable_named(*first)) else { return Vec::new() };
    scopes.references(symbol).into_iter().skip(1).map(|reference| reference.identifier).collect()
}

/// `variable.references` of an identifier that declares a variable.
pub fn references_of<'v>(scopes: &Scopes<'_, 'v>, declared: Node<'v>) -> Vec<Node<'v>> {
    scopes.variable_named(declared).map(|symbol| scopes.references(symbol).into_iter().map(|reference| reference.identifier).collect()).unwrap_or_default()
}
