//! Ports of PMD rules written in Java about unused members and loosely typed declarations.
mod members;
mod methods;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "UnusedPrivateFieldRule" => members::unused_private_field,
        "UnusedFormalParameterRule" => members::unused_formal_parameter,
        "LooseCouplingRule" => members::loose_coupling,
        "UnusedPrivateMethodRule" => methods::unused_private_method,
        _ => return None,
    })
}
