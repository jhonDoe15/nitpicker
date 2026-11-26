//! Ports of PMD rules written in Java about resources that must be closed.
mod close;
mod reassign;
mod types;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "CloseResourceRule" => close::close_resource,
        _ => return None,
    })
}
