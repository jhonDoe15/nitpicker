//! PMD rules that PMD writes in Java rather than XPath, ported to run on the PMD-shaped tree. A rule list names a
//! port by the PMD class of the rule; the findings go through the same suppressions as the XPath rules.
mod bestpractices;
mod checks;
mod constants;
mod design;
pub mod ctx;
mod errorprone;
mod exceptions;
mod frameworks;
mod logging;
mod loops;
mod message;
mod performance;
mod text;
mod unused;
mod usages;

pub use message::{expanded, formatted};

pub type Port = fn(&ctx::Ctx, &mut Vec<ctx::Hit>);

const PACKAGE: &str = "net.sourceforge.pmd.lang.java.rule.";

pub fn port(class: &str) -> Option<Port> {
    let short = class.strip_prefix(PACKAGE)?;
    let (category, name) = short.split_once('.')?;
    if let Some(found) = text::port(name).or_else(|| unused::port(name)).or_else(|| exceptions::port(name))
        .or_else(|| checks::port(name))
        .or_else(|| loops::port(name))
        .or_else(|| logging::port(name)) {
        return Some(found);
    }
    match category {
        "bestpractices" => bestpractices::port(name),
        "errorprone" => errorprone::port(name),
        "performance" | "security" => performance::port(name),
        "design" | "codestyle" | "multithreading" => design::port(name),
        _ => None,
    }
}

pub fn hit(node: u32) -> ctx::Hit {
    ctx::Hit { node, args: Vec::new(), message: None }
}

pub fn hit_with(node: u32, args: &[&str]) -> ctx::Hit {
    ctx::Hit {
        node,
        args: args.iter().map(|arg| arg.to_string()).collect(),
        message: None,
    }
}

pub fn hit_saying(node: u32, message: String) -> ctx::Hit {
    ctx::Hit { node, args: Vec::new(), message: Some(message) }
}
