//! Ports of PMD's design, code style and multithreading rules written in Java.
mod conditions;
pub mod paths;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "SimplifyConditionalRule" => conditions::simplify_conditional,
        _ => return super::performance::port(class),
    })
}
