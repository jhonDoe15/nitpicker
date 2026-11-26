//! Ports of PMD's design, code style and multithreading rules written in Java.
pub mod arrays;
pub mod paths;
pub mod style;
mod threads;
pub mod varargs;

use super::Port;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "SimplifyConditionalRule" => style::simplify_conditional,
        "ConfusingTernaryRule" => style::confusing_ternary,
        "UnsynchronizedStaticFormatterRule" => style::unsynchronized_static_formatter,
        "NonThreadSafeSingletonRule" => threads::non_thread_safe_singleton,
        "DoubleCheckedLockingRule" => threads::double_checked_locking,
        _ => return super::performance::port(class),
    })
}
