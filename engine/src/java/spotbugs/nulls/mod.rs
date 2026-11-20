//! SpotBugs' null-pointer patterns that need the flow of values through a method, rebuilt on the engine's flow
//! graph from the documented meaning of each pattern and from what SpotBugs 4.9.8 reports on test code:
//! NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE, NP_NULL_ON_SOME_PATH and NP_ALWAYS_NULL.
//!
//! What the experiments show, and what this follows:
//! - A value may be null when it comes from a method or a field marked `@CheckForNull` (or with a nickname for it),
//!   from `null`, or from the null side of a test.
//! - Such a value is reported where it is dereferenced. A value that only may be null is not reported once the
//!   flow has split, unless it is dereferenced whichever way the flow goes; a `throw` statement and a `return`
//!   count as ways that do not dereference, exceptions thrown by calls do not count as ways at all.
//! - A test of the value and `Objects.requireNonNull` end the report. A comparison with `null` that is only
//!   turned into a boolean is not a test.
//! - The test of an `assert` is run: a dereference in it is reported. Past any `assert`, nothing is reported for
//!   a value that only may be null before it.
//! - Results of one method dereferenced on one line make one finding.
//! - What is known about a field of `this` ends at a call on `this`, a call handed `this`, and a `synchronized`
//!   block. A `volatile` field is read anew each time. Static fields and fields of other objects are kept.
//! - Lambda bodies are not looked at.
mod effects;
mod forward;
mod marks;
mod must;
mod paths;

use super::{Context, names};
use crate::engine::source::{children, parent, walk};
use crate::java::helpers::has_modifier;
use effects::{How, Shared, Unit};
use forward::{Flow, Kind, NULL, Site};
use paths::strip;
use std::collections::BTreeMap;
use tree_sitter::Node;

const FROM_RETURN: &str = "NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE";
const SOME_PATH: &str = "NP_NULL_ON_SOME_PATH";
const ALWAYS: &str = "NP_ALWAYS_NULL";

fn body_of(class: Node) -> Option<Node> {
    class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))
}

fn members(class: Node) -> Vec<Node> {
    let Some(body) = body_of(class) else { return Vec::new() };
    let mut found = children(body);
    found.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    found
}

struct Labels<'c, 'a> {
    context: &'c Context<'a>,
    own: &'c str,
    class: Node<'a>,
}

impl<'a> Labels<'_, 'a> {
    fn outer(&self) -> Option<String> {
        let inner = self.class.kind() == "class_declaration" && !has_modifier(self.class, "static") && parent(self.class).is_some_and(|holder| holder.kind() == "class_body");
        let nest = crate::java::types::scope::enclosing_types(self.context.resolver.scope, self.class);
        nest.get(1).filter(|_| inner).cloned()
    }

    fn fixed(&self) -> String {
        let owner = names::binary(self.context, self.own);
        let simple = owner.rsplit(['.', '$']).next().unwrap_or_default().to_string();
        format!("{owner}.<static initializer for {simple}>()")
    }

    fn constructor(&self) -> String {
        let outer = self.outer();
        let first = members(self.class).into_iter().find(|member| member.kind() == "constructor_declaration");
        match first {
            Some(first) => names::method(self.context, self.own, first, outer.as_deref()),
            None if self.class.kind() == "object_creation_expression" => format!("new {}()", names::binary(self.context, self.own)),
            None => names::method(self.context, self.own, self.class, outer.as_deref()),
        }
    }

    /// The bodies a member holds, each with its parameters and the name messages give it.
    fn units(&self, member: Node<'a>) -> Vec<(Node<'a>, Option<Node<'a>>, String)> {
        let body = member.child_by_field_name("body");
        let parameters = member.child_by_field_name("parameters");
        match member.kind() {
            "method_declaration" => body.map(|body| (body, parameters, names::method(self.context, self.own, member, None))).into_iter().collect(),
            "constructor_declaration" => {
                let label = names::method(self.context, self.own, member, self.outer().as_deref());
                body.map(|body| (body, parameters, label)).into_iter().collect()
            }
            "compact_constructor_declaration" => {
                let label = names::method(self.context, self.own, self.class, None);
                body.map(|body| (body, self.class.child_by_field_name("parameters"), label)).into_iter().collect()
            }
            "static_initializer" => children(member).into_iter().find(|part| part.kind() == "block").map(|block| (block, None, self.fixed())).into_iter().collect(),
            "block" => vec![(member, None, self.constructor())],
            "field_declaration" | "constant_declaration" => {
                let fixed = member.kind() == "constant_declaration" || has_modifier(member, "static") || self.class.kind() == "interface_declaration";
                let label = if fixed { self.fixed() } else { self.constructor() };
                let values = children(member).into_iter().filter(|part| part.kind() == "variable_declarator").filter_map(|part| part.child_by_field_name("value"));
                values.map(|value| (value, None, label.clone())).collect()
            }
            _ => Vec::new(),
        }
    }
}

fn line(context: &Context, site: &Site) -> usize {
    let of = strip(site.of);
    match site.how {
        How::Call | How::Parameter => context.line(site.at),
        How::Other if of.kind() == "method_invocation" => context.line(of.child_by_field_name("name").unwrap_or(of)),
        How::Other => context.line_at(of.end_byte().saturating_sub(1)),
    }
}

fn report(context: &Context, unit: &Unit, flow: &Flow, label: &str) {
    let mut grouped: BTreeMap<u32, Vec<&Site>> = BTreeMap::new();
    for site in &flow.sites {
        grouped.entry(site.origin).or_default().push(site);
    }
    let mut returned = std::collections::HashSet::new();
    for (origin, mut sites) in grouped {
        let origin = &flow.origins[origin as usize];
        sites.sort_by_key(|site| site.at.start_byte());
        sites.dedup_by_key(|site| site.at.id());
        let first = sites[0];
        let at = line(context, first);
        if origin.kind == Kind::Returned {
            // One finding for each called method and line, however many of its results are dereferenced there.
            if !returned.insert((at, origin.name.clone())) {
                continue;
            }
            context.report(FROM_RETURN, first.at, at, format!("Possible null pointer dereference in {label} due to return value of called method"));
            continue;
        }
        // Handing a null value to a method that dereferences it is NP_NULL_PARAM_DEREF, and a value dereferenced
        // at several places past a split is NP_GUARANTEED_DEREF: neither is reported here.
        if first.how == How::Parameter || (first.tag != NULL && sites.len() > 1) {
            continue;
        }
        let variable = first.path.map(|path| unit.finder.all[path].shown.clone());
        let certain = first.tag == NULL && origin.kind == Kind::Unnamed;
        let name = origin.name.clone().filter(|_| !certain).or(variable).unwrap_or_else(|| "null".to_string());
        if first.tag == NULL {
            context.report(ALWAYS, first.at, at, format!("Null pointer dereference of {name} in {label}"));
        } else {
            context.report(SOME_PATH, first.at, at, format!("Possible null pointer dereference of {name} in {label}"));
        }
    }
}

fn class<'a>(shared: &Shared<'_, 'a>, class: Node<'a>, own: &str) {
    let context = shared.context;
    let labels = Labels { context, own, class };
    let Some(inside) = body_of(class) else { return };
    for member in members(class) {
        for (body, parameters, label) in labels.units(member) {
            let unit = Unit::build(shared, own, body, parameters);
            let (starts, ends) = must::run(&unit);
            let mut flow = Flow::new(&unit, &starts, &ends);
            flow.run();
            report(context, &unit, &flow, &label);
        }
        // Classes without a name written inside this one's members.
        let mut unnamed = Vec::new();
        walk(member, |node| {
            if node.kind() == "object_creation_expression" && children(node).iter().any(|part| part.kind() == "class_body") {
                unnamed.push(node);
            }
        });
        for node in unnamed {
            let mut holder = parent(node);
            while let Some(at) = holder.filter(|at| !at.kind().ends_with("_body")) {
                holder = parent(at);
            }
            let name = context.resolver.scope.names.get(&node.id());
            if let Some(name) = name.filter(|_| holder == Some(inside)) {
                self::class(shared, node, name);
            }
        }
    }
}

/// Reports where a value that may be null is dereferenced in the methods, constructors and initializers of a class.
pub fn null_dereference<'a>(context: &Context<'a>, declaration: Node<'a>) {
    if !context.wants(&[FROM_RETURN, SOME_PATH, ALWAYS]) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&declaration.id()) else { return };
    class(&Shared::new(context), declaration, own);
}
