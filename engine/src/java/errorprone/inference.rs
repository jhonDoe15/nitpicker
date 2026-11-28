//! The type arguments of a class instance creation, diamond included, the way javac infers them from the place it stands in.
use super::Context;
use crate::java::types::model::Type;
use std::collections::HashMap;
use tree_sitter::Node;

/// The type arguments of the created class, or empty for a raw type; `None` when they cannot be told.
pub fn created_arguments(context: &Context, creation: Node) -> Option<Vec<Type>> {
    let written_node = creation.child_by_field_name("type")?;
    let Type::Class(name, given) = context.resolver.type_node(written_node)? else { return None };
    if !given.is_empty() || written_node.kind() != "generic_type" {
        return Some(given);
    }
    let info = context.resolver.index.get(&name)?;
    if info.type_parameters.is_empty() {
        return Some(Vec::new());
    }
    if let Some(Type::Class(target, wanted)) = context.resolver.expected(creation) {
        let variables: Vec<Type> = info.type_parameters.iter().map(|(own, _)| Type::Variable(own.clone())).collect();
        let upward = context.resolver.index.arguments_as(&Type::Class(name.clone(), variables.clone()), &target);
        if let Some(upward) = upward {
            let mut map: HashMap<String, Type> = HashMap::new();
            for (pattern, actual) in upward.iter().zip(&wanted) {
                if let Type::Variable(own) = pattern {
                    map.insert(own.clone(), actual.clone());
                }
            }
            if !map.is_empty() {
                return Some(variables.iter().map(|variable| variable.substitute(&map)).collect());
            }
        }
    }
    match context.resolver.type_of(creation)? {
        Type::Class(_, arguments) => Some(arguments),
        _ => None,
    }
}
