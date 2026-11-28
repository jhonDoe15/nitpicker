//! PMD rules that PMD writes in Java rather than XPath, ported to run on the PMD-shaped tree. A rule list names a
//! port by the PMD class of the rule; the findings go through the same suppressions as the XPath rules.
mod bestpractices;
mod checks;
mod constants;
mod design;
pub mod ctx;
mod errorprone;
mod exceptions;
mod flow;
mod frameworks;
mod logging;
mod loops;
pub(crate) mod message;
mod performance;
mod resources;
pub mod suppressions;
mod text;
mod unused;
mod usages;
mod written;

pub use message::{expanded, formatted};

pub type Port = fn(&ctx::Ctx, &mut Vec<ctx::Hit>);

const PACKAGE: &str = "net.sourceforge.pmd.lang.java.rule.";

pub fn port(class: &str) -> Option<Port> {
    if class == suppressions::CLASS {
        return Some(suppressions::placeholder);
    }
    let short = class.strip_prefix(PACKAGE)?;
    let (category, name) = short.split_once('.')?;
    if let Some(found) = text::port(name).or_else(|| unused::port(name)).or_else(|| exceptions::port(name))
        .or_else(|| checks::port(name))
        .or_else(|| loops::port(name))
        .or_else(|| logging::port(name))
        .or_else(|| flow::port(name))
        .or_else(|| resources::port(name)) {
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

/// Of the names before a dot that start at `starts`, the ones PMD's usage resolution ties to no declaration while
/// the tree declares an earlier pattern variable of that name in the same body (a pattern the tree lost to a syntax
/// error decides nothing).
pub fn out_of_scope(tree: &super::tree::PmdTree, file: &crate::engine::source::SourceFile, resolver: &crate::java::types::scope::Resolver, starts: &[usize]) -> std::collections::HashSet<usize> {
    let machine = super::xpath::eval::Machine::new(tree, file, resolver);
    let (properties, usages, flow) = (Default::default(), std::cell::OnceCell::new(), std::cell::OnceCell::new());
    let ctx = ctx::Ctx { tree, file, machine: &machine, properties: &properties, usages: &usages, flow: &flow };
    let accesses = tree.named.get("VariableAccess").map(Vec::as_slice).unwrap_or_default();
    let found = ctx.usages();
    let patterns: Vec<u32> = tree.named.get("VariableId").map(Vec::as_slice).unwrap_or_default()
        .iter()
        .copied()
        .filter(|variable| ctx.parent(*variable).is_some_and(|owner| ctx.is(owner, "TypePattern")))
        .collect();
    let declared = |access: u32| {
        let name = ctx.text(access, "Name");
        let body = ctx.ancestors(access).find(|at| matches!(ctx.name(*at), "MethodDeclaration" | "ConstructorDeclaration" | "ClassBody" | "EnumBody" | "RecordBody"));
        let Some(body) = body else { return false };
        patterns.iter().any(|variable| *variable > body && *variable <= tree.last[body as usize] && *variable < access && ctx.text(*variable, "Name") == name)
    };
    accesses
        .iter()
        .filter(|access| starts.contains(&tree.nodes[**access as usize].start) && found.declaration(**access).is_none())
        .filter(|access| declared(**access))
        .map(|access| tree.nodes[*access as usize].start)
        .collect()
}
