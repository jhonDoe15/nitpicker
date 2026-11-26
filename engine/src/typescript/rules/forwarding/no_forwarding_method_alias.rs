//! `no-forwarding-method-alias`: a method of a class that only passes its parameters to another method of the
//! same class with the same parameter and return types.
use super::members::{alias_call, callee_name, is_candidate, is_later_of_mutual, key_name, methods_of, names_written_on_this};
use super::signatures::{has_same_signature, inherits_member, is_void_result, target_declaration};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind;
use std::collections::{HashMap, HashSet};

const RULE: &str = "no-forwarding-method-alias";

struct Match<'v> {
    member: Node<'v>,
    class: Node<'v>,
    call: Node<'v>,
}

fn message(name: &str, target: &str, rename: bool) -> String {
    let advice = if rename {
        format!("Rename `{target}` to `{name}` and delete the alias.")
    } else {
        format!("Call `{target}` directly and delete `{name}`.")
    };
    format!("`{name}` only forwards its parameters to `{target}` and has the same parameter and return types. {advice}")
}

fn is_reassigned(written: &HashSet<String>, names: [&str; 2]) -> bool {
    written.contains("[]") || names.iter().any(|name| written.contains(*name))
}

fn handle_of(types: &mut Types, node: Node, compiler_kind: u32) -> Option<String> {
    types.handle_at(Some(compiler_kind), node.start(), node.end())
}

fn verdict(types: &mut Types, written: &HashSet<String>, found: &Match) -> Option<bool> {
    let name = key_name(found.member)?;
    let target_name = callee_name(found.call);
    let function = found.member.node("value")?;
    let overloaded = methods_of(found.class).into_iter().filter(|other| key_name(*other).as_deref() == Some(name.as_str())).count();
    let first_returns = function.node("body")?.nodes("body").first().is_some_and(|statement| statement.is("ReturnStatement"));
    if overloaded != 1 || !is_later_of_mutual(found.class, found.member, found.call) || is_reassigned(written, [&name, &target_name]) {
        return None;
    }
    let class = handle_of(types, found.class, kind::CLASS_DECLARATION)?;
    let own = handle_of(types, found.member, kind::METHOD_DECLARATION)?;
    let property = found.call.node("callee")?.node("property")?;
    let property_kind = if property.is("PrivateIdentifier") { kind::PRIVATE_IDENTIFIER } else { kind::IDENTIFIER };
    let property = handle_of(types, property, property_kind)?;
    let (target, target_facts) = target_declaration(types, &property, &class)?;
    let own_facts = types.method_facts(&own)?;
    if !own_facts.is_method || target == own || (function.flag("async") && !target_facts.asynchronous) {
        return None;
    }
    if !(first_returns || is_void_result(types, &own)) || !has_same_signature(types, (&own, &own_facts), (&target, &target_facts)) || own_facts.deprecated {
        return None;
    }
    let class_facts = types.class_facts(&class)?;
    (!inherits_member(types, &class, &class_facts, &name)).then_some(own_facts.visibility < target_facts.visibility)
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let mut written: HashMap<u32, HashSet<String>> = HashMap::new();
    let mut found = Vec::new();
    for member in view.nodes().filter(|node| node.is("MethodDefinition")) {
        let class = member.parent().and_then(|body| body.parent()).filter(|class| class.is("ClassDeclaration"));
        let Some(class) = class.filter(|_| is_candidate(member)) else { continue };
        let Some(call) = alias_call(member) else { continue };
        let names = written.entry(class.index).or_insert_with(|| names_written_on_this(class));
        let mut types = types.borrow_mut();
        let rename = verdict(&mut types, names, &Match { member, class, call });
        if types.refused.is_some() {
            return;
        }
        if let (Some(rename), Some(key)) = (rename, member.node("key")) {
            let name = key_name(member).unwrap_or_default();
            found.push((key.start(), key.end(), message(&name, &callee_name(call), rename)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
