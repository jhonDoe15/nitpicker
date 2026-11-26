//! Ports of PMD rules written in Java about unused members and loosely typed declarations.
mod members;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "UnusedPrivateFieldRule" => members::unused_private_field,
        "UnusedFormalParameterRule" => members::unused_formal_parameter,
        "LooseCouplingRule" => members::loose_coupling,
        _ => return None,
    })
}
