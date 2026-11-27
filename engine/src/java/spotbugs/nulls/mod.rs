//! SpotBugs' null-pointer patterns that need the flow of values through a method, rebuilt on the engine's flow
//! graph from the documented meaning of each pattern and from what SpotBugs 4.9.8 reports on test code:
//! NP_NULL_ON_SOME_PATH_FROM_RETURN_VALUE, NP_NULL_ON_SOME_PATH and NP_ALWAYS_NULL.
//!
//! What the experiments show, and what this follows:
//! - A value may be null when it comes from a method or a field marked `@CheckForNull` (or with a nickname for it),
//!   from `null`, or from the null side of a test.
//! - Such a value is reported where it is dereferenced. A value that only may be null is not reported once the
//!   flow has split, unless it is dereferenced whichever way the flow goes; a `return` and a `throw` (which
//!   dereferences only what it throws) count as ways that do not dereference, exceptions thrown by calls do not
//!   count as ways at all, and nothing that may be null crosses into an exception handler.
//! - A method of the same file that dereferences a parameter whichever way it goes dereferences what it is handed.
//!   Methods with a variable number of parameters and calls more than twelve deep are not followed.
//! - A test of the value (`== null`, `!= null`, `Objects.isNull`, `Objects.nonNull`, `instanceof`) and
//!   `Objects.requireNonNull` end the report. A comparison with `null` that is only turned into a boolean is not
//!   a test, and neither is a test of a `volatile` field.
//! - The test of an `assert` is run: a dereference in it is reported. Past any `assert`, nothing is reported for
//!   a value that only may be null before it, and what the assertion compares with `null` is not null after it.
//! - Results of one method dereferenced on one line make one finding.
//! - What is known about a field of `this` ends at a call on `this` (written with or without `this.`, or with
//!   `super.`), a call or constructor handed `this`, `this(...)` or `super(...)`, and a `synchronized` block. A `volatile` field is read anew each time. Static fields and fields of other objects are kept.
//! - In a lambda body only the redundant tests and reads of known nulls are reported; an anonymous class inside one
//!   is looked at as any class.
//! - A `switch` statement of the old form without `default`: the way past every case counts as not taken.
mod copies;
mod effects;
mod elsewhere;
mod forward;
mod jdk;
mod marks;
mod must;
mod paths;
mod redundant;

use super::{Context, names};
use crate::engine::source::{children, parent};
use crate::java::helpers::has_modifier;
use effects::{How, Mode, Shared, Unit};
pub use elsewhere::Elsewhere;
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
            let message = format!("Null pointer dereference of {name} in {label}");
            context.report_listed(ALWAYS, first.at, at, message, dereferenced(unit, label, &name), 1, vec![name, label.to_string()]);
        } else {
            context.report(SOME_PATH, first.at, at, format!("Possible null pointer dereference of {name} in {label}"));
        }
    }
}

/// The place SpotBugs' SARIF names for a dereferenced value: the field it was read from, or the local variable.
fn dereferenced(unit: &Unit, label: &str, name: &str) -> String {
    match unit.finder.all.iter().find(|path| path.shown == name) {
        Some(path) if path.field => format!("member:{}", path.full),
        _ => super::place::variable(label, name),
    }
}

fn class<'a>(shared: &Shared<'_, 'a>, class: Node<'a>, own: &str) {
    let context = shared.context;
    let labels = Labels { context, own, class };
    for member in members(class) {
        for (body, parameters, label) in labels.units(member) {
            if !effects::may_hold_null(shared, own, body) {
                continue;
            }
            let unit = Unit::build(shared, own, body, parameters, Mode::Report);
            let (starts, ends) = must::run(&unit);
            let mut flow = Flow::new(&unit, &starts, &ends);
            flow.run();
            report(context, &unit, &flow, &label);
            redundant::report(context, &unit, &flow, &label);
            for lambda in lambdas(body) {
                lambda_body(shared, own, lambda);
            }
        }
    }
}

/// The lambdas inside a body, those inside other lambdas too, but not those of anonymous classes.
fn lambdas(body: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        match node.kind() {
            "class_body" => continue,
            "lambda_expression" => found.push(node),
            _ => {}
        }
        pending.extend(children(node));
    }
    found
}

/// The body of a lambda is a method of its own: only the redundant tests and known-null reads are reported in it.
fn lambda_body<'a>(shared: &Shared<'_, 'a>, own: &str, lambda: Node<'a>) {
    let context = shared.context;
    let (Some(body), Some(label)) = (lambda.child_by_field_name("body"), names::lambda(context, lambda)) else { return };
    let parameters = lambda.child_by_field_name("parameters").filter(|parameters| parameters.kind() == "formal_parameters");
    let unit = Unit::build(shared, own, body, parameters, Mode::Report);
    let (starts, ends) = must::run(&unit);
    let mut flow = Flow::new(&unit, &starts, &ends);
    flow.run();
    redundant::report(context, &unit, &flow, &label);
}

/// Reports where a value that may be null is dereferenced in the methods, constructors and initializers of the
/// classes of a file. Callee summaries are shared by the classes of the file.
pub fn null_dereference<'a>(context: &Context<'a>, declared: &[Node<'a>]) {
    if !context.wants(&[FROM_RETURN, SOME_PATH, ALWAYS, redundant::NONNULL_CHECK, redundant::NULL_CHECK, redundant::WOULD_THROW, redundant::KNOWN_NULL]) {
        return;
    }
    let shared = Shared::new(context);
    for declaration in declared {
        let Some(own) = context.resolver.scope.names.get(&declaration.id()) else { continue };
        shared.next_class();
        class(&shared, *declaration, own);
    }
}

/// A bit per parameter that a method or constructor of the file dereferences on every path that leaves it
/// normally, as the null patterns work it out for calls; with `locks` off, locking on a parameter does not count.
pub fn dereferenced_parameters<'a>(context: &Context<'a>, own: &str, declaration: Node<'a>, locks: bool) -> u64 {
    let Some(body) = declaration.child_by_field_name("body") else { return 0 };
    let shared = Shared::new(context);
    let unit = Unit::build_with(&shared, own, body, declaration.child_by_field_name("parameters"), Mode::Dereferences, locks);
    let (entry, _) = must::run(&unit);
    unit.parameters.iter().enumerate().take(64).filter(|(_, path)| must::has(&entry[0], **path)).fold(0, |bits, (position, _)| bits | 1 << position)
}

/// Whether SpotBugs takes the result of a method declared in the file as possibly null on purpose: marked
/// `@CheckForNull` (or a nickname, also on a method it overrides) or JSR-305 or SpotBugs `@Nullable` on itself.
pub fn declared_nullable(context: &Context, own: &str, declaration: Node) -> bool {
    const NULLABLE: &[&str] = &["javax.annotation.Nullable", "edu.umd.cs.findbugs.annotations.Nullable"];
    let resolver = context.resolver;
    let written = crate::java::helpers::annotation_names(context.file, declaration);
    if written.iter().any(|name| resolver.class_name(declaration, name).is_some_and(|full| NULLABLE.contains(&full.as_str()))) {
        return true;
    }
    let name = declaration.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let parameters = resolver.parameters(declaration.child_by_field_name("parameters")).0;
    let index = resolver.index;
    let found = index.get(own).and_then(|info| info.methods.iter().find(|method| method.name == name && method.parameters == parameters));
    found.is_some_and(|method| marks::method(index, own, method))
}
