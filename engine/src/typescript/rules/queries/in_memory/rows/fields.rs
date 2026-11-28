//! `field-visitor.mts`: the row fields an expression reads, through the row parameters and the names destructured
//! from them.
use crate::typescript::rules::queries::js_patterns::member_name;
use crate::typescript::rules::security_values::unwrapped;
use crate::typescript::rules::support::view::Node;

pub const FIELD_METHODS: [&str; 8] = ["localeCompare", "getTime", "valueOf", "startsWith", "endsWith", "includes", "toLowerCase", "toUpperCase"];

/// The names a callback binds to its rows: whole rows, and fields destructured from them.
#[derive(Default)]
pub struct Bound {
    pub elements: Vec<String>,
    pub destructured: Vec<String>,
}

impl Bound {
    pub fn is_element(&self, name: &str) -> bool {
        self.elements.iter().any(|element| element == name)
    }

    fn is_destructured(&self, name: &str) -> bool {
        self.destructured.iter().any(|field| field == name)
    }
}

pub struct Rooted<'s> {
    pub root: Node<'s>,
    pub first: Node<'s>,
    pub computed: bool,
    pub chain: Vec<Node<'s>>,
}

/// `rootOf`: the members of a member chain, outermost first, and what the innermost one reads from.
pub fn root_of(member: Node) -> Rooted {
    let mut chain = vec![member];
    while let Some(object) = chain.last().and_then(|current| current.node("object")).map(unwrapped).filter(|object| object.is("MemberExpression")) {
        chain.push(object);
    }
    let first = *chain.last().unwrap_or(&member);
    let computed = chain.iter().any(|current| current.flag("computed") && !current.node("property").is_some_and(|property| property.is("Literal")));
    let root = first.node("object").map(unwrapped).unwrap_or(first);
    Rooted { root, first, computed, chain }
}

fn root_field(root: Node, first: Node, bound: &Bound) -> bool {
    let Some(name) = root.name().filter(|_| root.is("Identifier")) else { return false };
    if bound.is_destructured(&name) {
        return true;
    }
    bound.is_element(&name) && member_name(first).is_some()
}

fn plain_field_receiver(node: Node) -> Option<Node> {
    if !node.is("CallExpression") || !node.nodes("arguments").is_empty() {
        return None;
    }
    let callee = unwrapped(node.node("callee")?);
    let method = member_name(callee).filter(|_| callee.is("MemberExpression"))?;
    FIELD_METHODS.contains(&method.as_str()).then(|| callee.node("object").map(unwrapped)).flatten()
}

/// `fieldOf`: whether the expression is a row field, possibly through argument-less string and date methods.
pub fn is_field(node: Node, bound: &Bound) -> bool {
    let mut target = unwrapped(node);
    while let Some(next) = plain_field_receiver(target) {
        target = next;
    }
    if target.is("Identifier") {
        return target.name().is_some_and(|name| bound.is_destructured(&name));
    }
    if !target.is("MemberExpression") {
        return false;
    }
    let rooted = root_of(target);
    !rooted.computed && root_field(rooted.root, rooted.first, bound)
}
