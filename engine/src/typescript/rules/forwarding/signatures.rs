//! The compiler's answers a forwarding method alias depends on: what the call resolves to, whether the two
//! methods have one signature, and whether the class takes the name from somewhere else.
use crate::typescript::rules::typed::questions::{ClassFacts, MethodFacts};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::{object_flags, type_flags};

/// The method a call on `this` names, when it is the only declaration of that name and a method of this class.
pub fn target_declaration(types: &mut Types, property: &str, class: &str) -> Option<(String, MethodFacts)> {
    let symbol = types.symbol_named(property, false)?;
    let [declaration] = symbol.declarations.as_slice() else { return None };
    let facts = types.method_facts(declaration)?;
    (facts.is_method && facts.parent.as_deref() == Some(class) && !facts.is_abstract).then(|| (declaration.clone(), facts))
}

fn same_type(types: &mut Types, own: &str, target: &str) -> bool {
    let (Some(left), Some(right)) = (types.type_of(own), types.type_of(target)) else { return false };
    left.id == right.id || (!types.call_signatures(&left).is_empty() && types.is_assignable(&left, &right) && types.is_assignable(&right, &left))
}

pub fn is_void_result(types: &mut Types, declaration: &str) -> bool {
    let Some(result) = types.declared_return_type(declaration) else { return false };
    matches!(types.type_text(&result).as_str(), "void" | "Promise<void>")
}

pub fn has_same_signature(types: &mut Types, own: (&str, &MethodFacts), target: (&str, &MethodFacts)) -> bool {
    let ((own_handle, own_facts), (target_handle, target_facts)) = (own, target);
    if own_facts.has_predicate || target_facts.has_predicate || own_facts.generic || target_facts.generic {
        return false;
    }
    if own_facts.parameters.len() != target_facts.parameters.len() {
        return false;
    }
    let pairs = own_facts.parameters.iter().zip(&target_facts.parameters);
    for (mine, theirs) in pairs {
        if mine.optional != theirs.optional || mine.rest != theirs.rest || !same_type(types, &mine.handle, &theirs.handle) {
            return false;
        }
    }
    let result = types.declared_return_type(own_handle);
    matches!((result, types.declared_return_type(target_handle)), (Some(left), Some(right)) if left.id == right.id)
}

fn has_property(types: &mut Types, owner: &Type, name: &str) -> bool {
    types.property(owner, name).is_some()
}

fn is_merged(types: &mut Types, class: &str, name: &str) -> bool {
    let Some(own) = types.type_of(class) else { return false };
    let Some(property) = types.property(&own, name) else { return false };
    property.declarations.iter().any(|declaration| types.parent_of(declaration).as_deref() != Some(class))
}

pub fn inherits_member(types: &mut Types, class: &str, facts: &ClassFacts, name: &str) -> bool {
    if !facts.heritage {
        return is_merged(types, class, name);
    }
    let Some(own) = types.type_of(class) else { return false };
    let extended = if own.object_flags & object_flags::CLASS_OR_INTERFACE != 0 { types.base_types(&own) } else { Vec::new() };
    let implemented: Vec<Type> = facts.implements.iter().filter_map(|node| types.type_from_node(node)).collect();
    let unresolved = (facts.extends && extended.is_empty()) || implemented.iter().any(|kind| kind.flags & type_flags::ANY != 0);
    unresolved || is_merged(types, class, name) || extended.iter().chain(&implemented).any(|owner| has_property(types, owner, name))
}
