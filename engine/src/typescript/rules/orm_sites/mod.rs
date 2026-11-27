//! `support/orm/`: the ORM or query builder call a member chain makes, whether it reads or writes, and the table
//! it names, recognised by the step names of `chains.mts` and the recognisers of `builders.mts` and `models.mts`.
pub mod builders;
pub mod models;
pub mod table_names;

use crate::typescript::rules::secrets::nodes::unwrapped;
use crate::typescript::rules::urls::values::string_value;
use crate::typescript::rules::support::view::Node;

#[derive(Clone, Copy, PartialEq)]
pub enum OrmKind {
    Read,
    Write,
}

pub struct OrmSite {
    pub table: Option<String>,
}

/// `ChainStep`: a call or member of the chain, with the call's arguments.
pub struct ChainStep<'s> {
    pub name: Option<String>,
    pub args: Option<Vec<Node<'s>>>,
}

/// `CallChain`: the steps from the root out, and the root's name.
pub struct CallChain<'s> {
    pub root: Option<String>,
    pub steps: Vec<ChainStep<'s>>,
}

impl<'s> CallChain<'s> {
    /// `steps.at(offset)` for a negative offset.
    pub fn from_end(&self, back: usize) -> Option<&ChainStep<'s>> {
        self.steps.len().checked_sub(back).and_then(|index| self.steps.get(index))
    }
}

pub struct FoundSite<'s> {
    pub site: OrmSite,
    pub chain: CallChain<'s>,
}

fn member_name(member: Node) -> Option<String> {
    let property = member.node("property")?;
    if member.flag("computed") { string_value(Some(property)) } else { property.name().map(|name| name.into_owned()) }
}

fn root_name(node: Node) -> Option<String> {
    if node.is("Identifier") {
        return node.name().map(|name| name.into_owned());
    }
    node.is("ThisExpression").then(|| "this".to_string())
}

/// `callChain`.
pub fn call_chain(call: Node) -> CallChain {
    let mut steps = Vec::new();
    let mut current = Some(unwrapped(call));
    let mut root = None;
    while let Some(node) = current {
        current = None;
        root = None;
        if node.is("CallExpression") {
            let args = Some(node.nodes("arguments"));
            let Some(callee) = node.node("callee").map(unwrapped) else { break };
            if callee.is("MemberExpression") {
                steps.push(ChainStep { name: member_name(callee), args });
                current = callee.node("object").map(unwrapped);
            } else {
                let name = callee.name().filter(|_| callee.is("Identifier")).map(|name| name.into_owned());
                steps.push(ChainStep { name: name.clone(), args });
                root = name;
            }
        } else if node.is("MemberExpression") {
            steps.push(ChainStep { name: member_name(node), args: None });
            current = node.node("object").map(unwrapped);
        } else {
            root = root_name(node);
        }
    }
    steps.reverse();
    CallChain { root, steps }
}

/// `firstString`.
pub fn first_string(args: Option<&Vec<Node>>) -> Option<String> {
    args.and_then(|args| args.first().copied()).and_then(|first| string_value(Some(first)))
}

/// `ormSite`.
pub fn orm_site<'s>(call: Node<'s>, kind: OrmKind, orms: &[String]) -> Option<FoundSite<'s>> {
    if orms.is_empty() {
        return None;
    }
    let chain = call_chain(call);
    if chain.steps.is_empty() {
        return None;
    }
    let site = builders::builder_site(&chain, kind, orms).or_else(|| models::model_site(&chain, kind, orms))?;
    Some(FoundSite { site, chain })
}
