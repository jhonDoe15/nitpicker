//! Ports of PMD rules written in Java about log calls.
mod format;
mod guard;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "GuardLogStatementRule" => guard::guard_log_statement,
        "InvalidLogMessageFormatRule" => format::invalid_log_message_format,
        _ => return None,
    })
}
