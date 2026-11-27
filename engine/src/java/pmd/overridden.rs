use crate::java::types::model::Type;
use std::collections::HashMap;

/// Whether a parameter of an inherited method, its class variables replaced, matches the one written: a type variable
/// of the inherited method stands for the variable in the same place of the overriding one, any other variable only
/// for itself or, as in a raw supertype, for its erasure. Other types compare erased.
pub fn same_parameter(theirs: &Type, erased: &Type, ours: Option<&Type>, generic: Option<&Type>, renamed: &HashMap<&str, &str>) -> bool {
    let Some(ours) = ours else { return true };
    match (theirs, generic) {
        (Type::Variable(variable), generic) => {
            let wanted = renamed.get(variable.as_str()).copied().unwrap_or(variable);
            matches!(generic, Some(Type::Variable(written)) if written == wanted)
                || (!renamed.contains_key(variable.as_str()) && erased.name() == ours.erased().name())
        }
        (Type::Array(element), Some(Type::Array(written))) if element.open() => {
            let (Type::Array(erased), Type::Array(ours)) = (erased, ours) else { return false };
            same_parameter(element, erased, Some(ours), Some(written), renamed)
        }
        (Type::Array(element), _) if element.open() => false,
        _ => theirs.erased().name() == ours.erased().name(),
    }
}
