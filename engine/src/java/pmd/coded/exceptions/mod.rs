//! Ports of PMD rules written in Java about thrown and caught exceptions.
mod stack;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "PreserveStackTraceRule" => stack::preserve_stack_trace,
        _ => return None,
    })
}
