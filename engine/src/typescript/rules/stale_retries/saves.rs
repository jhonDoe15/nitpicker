//! `stale-saves.mts`: a `save` call of a TypeORM receiver, the entity it saves, and whether that entity was
//! loaded before the retried region (`stale`) or re-read inside it and saved without a change (`lost`).
use super::no_stale_retry_after_conflict::Check;
use super::receivers::{is_repository_like, receiver_names};
use crate::typescript::rules::effects::callees::calls::callee_origin;
use crate::typescript::rules::effects::tags::has;
use crate::typescript::rules::held_scopes::estree_calls::{calls_within, is_function};
use crate::typescript::rules::held_scopes::owners::compiler_call;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::writes::syntax::{name_of, unwrapped};

const TRANSACTION_OPENERS: [&str; 3] = ["transaction", "transactional", "runInTransaction"];
const REFRESHES: [&str; 2] = ["reload", "refresh"];

fn is_model_name(name: &str) -> bool {
    name.starts_with(|letter: char| letter.is_ascii_uppercase())
}

fn is_opener_call(node: Option<Node>) -> bool {
    let Some(call) = node.filter(|node| node.is("CallExpression")) else { return false };
    let Some(callee) = call.node("callee") else { return false };
    let named = if callee.is("MemberExpression") { callee.node("property") } else { Some(callee) };
    name_of(named).is_some_and(|name| TRANSACTION_OPENERS.contains(&name.as_str()))
}

fn is_transaction_manager(receiver: Node) -> bool {
    let Some(name) = receiver.name().filter(|_| receiver.is("Identifier")) else { return false };
    receiver.ancestors().any(|node| {
        is_function(node) && name_of(node.nodes("params").first().copied()).as_deref() == Some(name.as_ref()) && is_opener_call(node.parent())
    })
}

fn spread_identifier(argument: Node) -> Option<Node> {
    if !argument.is("ObjectExpression") {
        return None;
    }
    let spread = argument.nodes("properties").into_iter().find(|property| property.is("SpreadElement"))?;
    spread.node("argument").filter(|inner| inner.is("Identifier"))
}

fn entity_of(call: Node) -> Option<Node> {
    for argument in call.nodes("arguments").into_iter().map(unwrapped) {
        if argument.is("Identifier") && !argument.name().is_some_and(|name| is_model_name(&name)) {
            return Some(argument);
        }
        if let Some(spread) = spread_identifier(argument) {
            return Some(spread);
        }
    }
    None
}

fn is_refresh(call: Node) -> bool {
    let callee = call.node("callee").filter(|callee| call.is("CallExpression") && callee.is("MemberExpression"));
    callee.and_then(|callee| name_of(callee.node("property"))).is_some_and(|name| REFRESHES.contains(&name.as_str()))
}

fn is_fresh_read(init: Option<Node>) -> bool {
    let Some(value) = init.map(unwrapped) else { return false };
    let call = if value.is("AwaitExpression") { value.node("argument").map(unwrapped) } else { Some(value) };
    let Some(call) = call.filter(|call| call.is("CallExpression")) else { return false };
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
    callee.is_some_and(|callee| name_of(callee.node("property")).unwrap_or_default().starts_with("find"))
}

impl Check<'_, '_, '_> {
    fn is_typeorm_receiver(&mut self, call: Node, receiver: Node) -> bool {
        if is_repository_like(&receiver_names(receiver)) || is_transaction_manager(receiver) {
            return true;
        }
        let mut types = self.types.borrow_mut();
        let Some(compiler) = compiler_call(&mut types, call) else { return false };
        callee_origin(&mut types, &compiler).is_some_and(|origin| origin.package.as_deref() == Some("typeorm"))
    }

    pub(super) fn is_save(&mut self, call: Node) -> bool {
        let Some(callee) = call.node("callee").map(unwrapped) else { return false };
        let is_save = callee.is("MemberExpression") && !callee.flag("computed") && callee.node("property").and_then(|property| property.name()).as_deref() == Some("save");
        match callee.node("object") {
            Some(receiver) if is_save => self.is_typeorm_receiver(call, receiver),
            _ => false,
        }
    }

    fn written_inside(&self, variable: oxc_semantic::SymbolId, region: Node) -> bool {
        let declared: Vec<u32> = self.scopes.defs(variable).iter().map(|definition| definition.name.start()).collect();
        self.scopes.references(variable).into_iter().any(|reference| {
            reference.write && !declared.contains(&reference.identifier.start()) && region.contains(reference.identifier)
        })
    }

    fn reads_inside(&mut self, region: Node) -> bool {
        for call in calls_within(region) {
            let effects = {
                let mut types = self.types.borrow_mut();
                let Some(compiler) = compiler_call(&mut types, call) else { return false };
                self.state.call_effects(&mut types, &compiler)
            };
            if is_refresh(call) || (has(&effects, "database") && !has(&effects, "write")) {
                return true;
            }
        }
        false
    }

    pub(super) fn stale_entity(&mut self, call: Node, region: Node) -> Option<String> {
        let entity = entity_of(call)?;
        let variable = self.scopes.variable_by_name(&entity.name()?, entity.start())?;
        let declared = self.scopes.defs(variable).into_iter().next()?.name;
        if region.contains(declared) {
            return None;
        }
        let fresh = self.written_inside(variable, region) || self.reads_inside(region);
        if fresh { None } else { entity.name().map(|name| name.into_owned()) }
    }

    pub(super) fn unchanged_entity(&mut self, call: Node, region: Node) -> Option<String> {
        let first = call.nodes("arguments").into_iter().find(|argument| argument.is("Identifier"))?;
        let variable = self.scopes.variable_by_name(&first.name()?, first.start())?;
        let declarator = self.scopes.defs(variable).into_iter().next()?.node;
        if !declarator.is("VariableDeclarator") || !region.contains(declarator) || !is_fresh_read(declarator.node("init")) {
            return None;
        }
        let id = declarator.node("id");
        let others = self.scopes.references(variable).into_iter().filter(|reference| reference.identifier != first && Some(reference.identifier) != id).count();
        if others == 0 { first.name().map(|name| name.into_owned()) } else { None }
    }
}
