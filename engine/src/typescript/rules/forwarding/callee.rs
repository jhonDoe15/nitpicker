//! The compiler's answers a forwarding function wrapper depends on: whether the callee is async and whether
//! the wrapper and the callee have one signature.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Signature;

pub fn is_async_callee(types: &mut Types, callee: &str) -> bool {
    let Some(symbol) = types.symbol_named(callee, true) else { return false };
    symbol.declarations.iter().any(|declaration| types.is_async_declaration(declaration))
}

fn only_signature(types: &mut Types, handle: &str) -> Option<Signature> {
    let kind = types.type_of(handle)?;
    let mut signatures = types.call_signatures(&kind);
    (signatures.len() == 1).then(|| signatures.remove(0))
}

fn same_parameters(types: &mut Types, own: &Signature, target: &Signature) -> bool {
    let (own, target) = (types.signature_parameters(own), types.signature_parameters(target));
    if own.len() != target.len() {
        return false;
    }
    own.iter().zip(&target).all(|(mine, theirs)| {
        let shape = |types: &mut Types, parameter: &crate::typescript::types::server::Symbol| {
            let declared = parameter.value_declaration.as_deref().and_then(|declaration| types.parameter_shape(declaration)).unwrap_or((false, false));
            (types.type_of_symbol(parameter).map(|kind| kind.id), declared)
        };
        let (left, right) = (shape(types, mine), shape(types, theirs));
        left.0.is_some() && left == right
    })
}

pub fn has_same_function_signature(types: &mut Types, wrapper: &str, callee: &str) -> bool {
    let (Some(own), Some(target)) = (only_signature(types, wrapper), only_signature(types, callee)) else { return false };
    if types.has_predicate(&own) || types.has_predicate(&target) || !same_parameters(types, &own, &target) {
        return false;
    }
    let (left, right) = (types.return_type(&own), types.return_type(&target));
    matches!((left, right), (Some(left), Some(right)) if left.id == right.id)
}
