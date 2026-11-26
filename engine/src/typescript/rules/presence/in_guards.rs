//! Whether the code around a `'key' in object` test reads the value or reports a missing one, so the test is not
//! the only guard.
use super::Facts;
use super::conditions::{plain_text, siblings_after, unwrapped};
use crate::typescript::rules::support::view::Node;
use oxc_semantic::SymbolId;

pub struct InCheck<'k, 's> {
    pub node: Node<'s>,
    pub root: Node<'s>,
    pub key: &'k str,
}

fn member_key(node: Node) -> Option<String> {
    let property = node.node("property")?;
    if !node.flag("computed") {
        return property.name().map(|name| name.into_owned());
    }
    property.is("Literal").then(|| property.text("value").map(|value| value.into_owned())).flatten()
}

pub fn is_absent(node: Node) -> bool {
    (node.is("Identifier") && node.name().as_deref() == Some("undefined"))
        || (node.is("Literal") && node.get("value") == crate::typescript::rules::support::view::Value::Null && node.text("raw").as_deref() == Some("null"))
}

pub fn ends_with_throw(branch: Node) -> bool {
    let last = if branch.is("BlockStatement") { branch.nodes("body").last().copied() } else { Some(branch) };
    last.is_some_and(|last| last.is("ThrowStatement"))
}

fn is_validator_call(parent: Node, node: Node) -> bool {
    let name = parent.node("callee").filter(|callee| callee.is("Identifier")).and_then(|callee| callee.name());
    parent.is("CallExpression")
        && name.is_some_and(|name| ["is", "has", "assert", "validate"].iter().any(|prefix| name.starts_with(prefix)))
        && parent.nodes("arguments").contains(&node)
}

fn used_as_check(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    match parent.kind() {
        "UnaryExpression" => matches!(parent.text("operator").as_deref(), Some("typeof" | "!")),
        "IfStatement" | "ConditionalExpression" => parent.node("test") == Some(node),
        kind => kind == "LogicalExpression" || is_validator_call(parent, node),
    }
}

impl<'s> Facts<'_, '_, 's> {
    fn reads_in(&self, check: &InCheck<'_, 's>, regions: &[Node<'s>]) -> Vec<Node<'s>> {
        let target = self.plain_text(check.node.node("right").unwrap_or(check.node));
        regions
            .iter()
            .flat_map(|region| region.descendants())
            .filter(|candidate| {
                candidate.is("MemberExpression")
                    && member_key(*candidate).as_deref() == Some(check.key)
                    && candidate.node("object").is_some_and(|object| plain_text(self.text, unwrapped(object)) == target)
            })
            .collect()
    }

    fn declared_variables(&self, declarator: Node<'s>) -> Vec<SymbolId> {
        let mut found = Vec::new();
        let Some(id) = declarator.node("id") else { return found };
        for identifier in id.descendants().into_iter().filter(|node| node.is("Identifier")) {
            let Some(symbol) = self.scopes.variable_named(identifier) else { continue };
            if !found.contains(&symbol) && self.scopes.defs(symbol).iter().any(|definition| definition.node == declarator) {
                found.push(symbol);
            }
        }
        found
    }

    fn is_validated(&self, read: Node<'s>) -> bool {
        let holder = read.parent().filter(|holder| holder.is("VariableDeclarator") && holder.node("init") == Some(read));
        let Some(holder) = holder else { return used_as_check(read) };
        let id = holder.node("id");
        self.declared_variables(holder)
            .into_iter()
            .flat_map(|symbol| self.scopes.references(symbol))
            .any(|reference| Some(reference.identifier) != id && used_as_check(reference.identifier))
    }

    fn is_handled_branch(&self, check: &InCheck<'_, 's>, branch: Node<'s>) -> bool {
        if branch.is("IfStatement") {
            let Some(consequent) = branch.node("consequent") else { return false };
            let mut regions = vec![consequent];
            regions.extend(siblings_after(branch));
            let reads = self.reads_in(check, &regions);
            return ends_with_throw(consequent) || reads.iter().any(|read| self.is_validated(*read));
        }
        if !branch.is("ConditionalExpression") {
            return false;
        }
        let Some(consequent) = branch.node("consequent") else { return false };
        let reads = self.reads_in(check, &[consequent]);
        (!reads.is_empty() && branch.node("alternate").is_some_and(is_absent)) || reads.iter().any(|read| self.is_validated(*read))
    }

    pub fn is_value_handled(&self, check: &InCheck<'_, 's>) -> bool {
        let branch = check.root.parent().filter(|parent| parent.node("test") == Some(check.root));
        !self.reads_in(check, &[check.root]).is_empty() || branch.is_some_and(|branch| self.is_handled_branch(check, branch))
    }
}
