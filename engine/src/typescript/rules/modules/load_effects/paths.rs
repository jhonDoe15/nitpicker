//! Member chains as the ESLint helpers `memberPath` and `calleeNameOf` read them.
use crate::typescript::rules::support::view::Node;

/// `calleeNameOf`: the name of an identifier, or of the property of a member that is not computed.
pub fn callee_name_of(callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        return callee.name().map(|name| name.into_owned());
    }
    if callee.is("MemberExpression") && !callee.flag("computed") {
        return callee.node("property").and_then(|property| property.name()).map(|name| name.into_owned());
    }
    None
}

/// `memberPath`: the names along the object chain, outermost object first.
pub fn member_path(node: Node) -> Vec<Option<String>> {
    let mut chain = vec![node];
    let mut at = 0;
    while at < chain.len() {
        if chain[at].is("MemberExpression") && let Some(object) = chain[at].node("object") {
            chain.push(object);
        }
        at += 1;
    }
    chain.into_iter().map(callee_name_of).rev().collect()
}

/// `calleeText`: the dotted path when every segment has a name.
pub fn callee_text(callee: Node) -> Option<String> {
    let path = member_path(callee);
    path.iter().all(Option::is_some).then(|| path.into_iter().flatten().collect::<Vec<_>>().join("."))
}
