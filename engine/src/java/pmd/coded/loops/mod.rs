//! Ports of PMD rules written in Java about loops and their variables.
mod foreach;
mod reassigning;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "ForLoopCanBeForeachRule" => foreach::for_loop_can_be_foreach,
        "AvoidReassigningLoopVariablesRule" => reassigning::avoid_reassigning_loop_variables,
        _ => return None,
    })
}
