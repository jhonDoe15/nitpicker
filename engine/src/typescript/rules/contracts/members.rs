//! `exportLeaks`: the persistence handles and the request or response objects a feature's export hands out in
//! the signatures of its functions, classes, variables and the members of its interfaces and namespaces.
use super::infrastructure::Infrastructure;
use super::walk::{infrastructure_in, is_nest_controller, symbol_infrastructure, type_symbols};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::{Signature, Symbol, Type};
use crate::typescript::types::tables::{symbol_flags as flags, type_flags};
use std::collections::HashSet;
use std::rc::Rc;

pub struct Leak {
    pub member: String,
    pub found: Infrastructure,
}

struct Member {
    name: String,
    signatures: Vec<Signature>,
}

struct Scope<'l> {
    label: &'l str,
    allow_transport: bool,
}

const OWN_LEAKS: u32 = flags::CLASS | flags::FUNCTION | flags::VARIABLE;
const TYPE_LEAKS: u32 = flags::INTERFACE | flags::TYPE_ALIAS;

fn is_handler_signature(types: &mut Types, signature: &Signature) -> bool {
    for parameter in types.parameters_of(signature) {
        let Some(kind) = types.type_of_symbol(&parameter) else { continue };
        if infrastructure_in(types, &kind).iter().any(Infrastructure::is_request) {
            return true;
        }
    }
    false
}

fn signature_leaks(types: &mut Types, signature: &Signature, allow_transport: bool) -> Vec<Infrastructure> {
    let handler = allow_transport || is_handler_signature(types, signature);
    let mut found = Vec::new();
    for kind in types.signature_types(signature) {
        found.extend(infrastructure_in(types, &kind));
    }
    found.retain(|found| !(handler && found.is_transport()));
    found
}

fn callable_members(types: &mut Types, kind: &Type) -> Vec<Member> {
    let mut members = Vec::new();
    for property in types.properties(kind) {
        if property.name == "prototype" || !types.is_project_declared(&property) || !types.is_public(&property) {
            continue;
        }
        let signatures = types.type_of_symbol(&property).map(|kind| types.call_signatures(&kind)).unwrap_or_default();
        if !signatures.is_empty() {
            members.push(Member { name: property.name.clone(), signatures });
        }
    }
    members
}

fn member_leaks(types: &mut Types, members: &[Member], scope: &Scope) -> Vec<Leak> {
    let mut leaks = Vec::new();
    for Member { name, signatures } in members {
        for signature in signatures {
            for found in signature_leaks(types, signature, scope.allow_transport) {
                leaks.push(Leak { member: format!("{}.{name}", scope.label), found });
            }
        }
    }
    leaks
}

fn is_factory(types: &mut Types, signature: &Signature) -> bool {
    let Some(returns) = types.return_type(signature) else { return false };
    if returns.flags & type_flags::OBJECT == 0 || types.awaited_parts(&returns).iter().map(|part| part.id).ne([returns.id]) {
        return false;
    }
    !types.is_array_like(&returns) && types.call_signatures(&returns).is_empty() && infrastructure_in(types, &returns).is_empty()
}

fn function_leaks(types: &mut Types, signatures: &[Signature], label: &str) -> Vec<Leak> {
    let mut leaks = Vec::new();
    for signature in signatures {
        if is_factory(types, signature) {
            let members = types.return_type(signature).map(|returns| callable_members(types, &returns)).unwrap_or_default();
            leaks.extend(member_leaks(types, &members, &Scope { label: &format!("{label}()"), allow_transport: false }));
        } else {
            leaks.extend(signature_leaks(types, signature, false).into_iter().map(|found| Leak { member: label.to_string(), found }));
        }
    }
    leaks
}

fn class_leaks(types: &mut Types, symbol: &Symbol, label: &str) -> Vec<Leak> {
    let allow_transport = types.class_declarations(symbol).first().cloned().is_some_and(|declaration| is_nest_controller(types, &declaration));
    let instance = types.declared_type_of(symbol).map(|kind| callable_members(types, &kind)).unwrap_or_default();
    let statics = types.type_of_symbol(symbol).map(|kind| callable_members(types, &kind)).unwrap_or_default();
    let mut leaks = member_leaks(types, &instance, &Scope { label, allow_transport });
    for Member { name, signatures } in &statics {
        leaks.extend(function_leaks(types, signatures, &format!("{label}.{name}")));
    }
    leaks
}

fn type_leaks(types: &mut Types, kind: &Type, label: &str) -> Vec<Leak> {
    let signatures = types.call_signatures(kind);
    let mut leaks = function_leaks(types, &signatures, label);
    let members = callable_members(types, kind);
    leaks.extend(member_leaks(types, &members, &Scope { label, allow_transport: false }));
    leaks
}

fn variable_leaks(types: &mut Types, kind: &Type, label: &str) -> Vec<Leak> {
    let parts = if kind.flags & type_flags::UNION != 0 { types.parts(kind).to_vec() } else { vec![kind.clone()] };
    let mut held = Vec::new();
    for part in &parts {
        held.extend(type_symbols(types, part).iter().filter_map(symbol_infrastructure));
    }
    if held.is_empty() {
        return type_leaks(types, kind, label);
    }
    held.into_iter().map(|found| Leak { member: label.to_string(), found }).collect()
}

fn symbol_leaks(types: &mut Types, symbol: &Symbol, label: &str) -> Vec<Leak> {
    if symbol.flags & flags::CLASS != 0 {
        return class_leaks(types, symbol, label);
    }
    if symbol.flags & (flags::VARIABLE | flags::FUNCTION) != 0 {
        return match types.type_of_symbol(symbol) {
            Some(kind) if symbol.flags & flags::VARIABLE != 0 => variable_leaks(types, &kind, label),
            Some(kind) => type_leaks(types, &kind, label),
            None => Vec::new(),
        };
    }
    if symbol.flags & TYPE_LEAKS == 0 {
        return Vec::new();
    }
    types.declared_type_of(symbol).map(|kind| type_leaks(types, &kind, label)).unwrap_or_default()
}

fn is_namespace(symbol: &Symbol) -> bool {
    symbol.flags & flags::VALUE_MODULE != 0 && symbol.flags & (OWN_LEAKS | TYPE_LEAKS) == 0
}

/// The leaks of one export, and of the namespaces it holds, each member named by the path to it.
pub fn export_leaks(types: &mut Types, exported: &Rc<Symbol>) -> Vec<Leak> {
    let mut leaks = Vec::new();
    let mut seen = HashSet::new();
    let mut pending = vec![(Rc::clone(exported), exported.name.clone())];
    let mut at = 0;
    while at < pending.len() {
        let (entry, label) = pending[at].clone();
        at += 1;
        let Some(symbol) = types.resolved_symbol(entry) else { continue };
        if !seen.insert(symbol.id) {
            continue;
        }
        leaks.extend(symbol_leaks(types, &symbol, &label));
        if is_namespace(&symbol) {
            for child in types.module_exports(&symbol) {
                let child_label = format!("{label}.{}", child.name);
                pending.push((child, child_label));
            }
        }
        if types.refused.is_some() {
            break;
        }
    }
    leaks
}
