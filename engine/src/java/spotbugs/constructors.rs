//! CT_CONSTRUCTOR_THROW: an exception can leave a constructor of a class that can be subclassed, which leaves a
//! half-built object a finalizer could get hold of. An anonymous class counts too: its field initializers and
//! initializer blocks run in the constructor the compiler writes for it.
use super::handlers::{caught, catch_types, closing, declares, Guard, UNKNOWN};
use super::{Context, lombok, names, place};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::model::flag;
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::cell::RefCell;
use std::collections::HashMap;
use tree_sitter::Node;

const TAIL: &str = "will leave the constructor. The object under construction remains partially initialized and may be vulnerable to Finalizer attacks.";

/// Where an exception starts, its type, and whether that is before the `super(...)` or `this(...)` call runs.
type Site<'t> = (Node<'t>, String, bool);

struct Scan<'c, 'a, 't> {
    context: &'c Context<'a>,
    own: &'c str,
    methods: Vec<Node<'t>>,
    /// Name and erased parameter types of each method, worked out on first use.
    signatures: std::cell::OnceCell<Vec<(String, Vec<crate::java::types::model::Type>)>>,
    constructors: Vec<Node<'t>>,
    /// Field initializers and initializer blocks: they run in every constructor that does not start with `this(...)`.
    shared: Vec<Node<'t>>,
    /// Per method of the class: the exception types that can leave it. Empty while it is being worked out.
    leaves: RefCell<HashMap<usize, Vec<String>>>,
    /// Set while the constructor a `this(...)` names is looked at, which stops at one level.
    delegating: std::cell::Cell<bool>,
}

impl<'t> Scan<'_, '_, 't> {
    /// A `switch` used as a value without a `default`: the compiler adds a throw for the case nothing matches.
    fn may_not_match(&self, switch: Node) -> bool {
        let as_value = parent(switch).is_some_and(|around| !matches!(around.kind(), "block" | "switch_block_statement_group" | "switch_rule" | "expression_statement" | "labeled_statement" | "if_statement" | "for_statement" | "enhanced_for_statement" | "while_statement" | "do_statement" | "constructor_body" | "program"));
        let mut has_default = false;
        if let Some(body) = switch.child_by_field_name("body") {
            for group in children(body) {
                has_default |= children(group).into_iter().filter(|part| part.kind() == "switch_label").any(|label| self.context.text(label).contains("default"));
            }
        }
        as_value && !has_default
    }

    /// `clone()` of an array declares no exception, unlike `Object.clone()`.
    fn array_clone(&self, call: Node) -> bool {
        call.child_by_field_name("name").is_some_and(|name| self.context.text(name) == "clone")
            && call.child_by_field_name("object").and_then(|object| self.context.resolver.type_of(object)).is_some_and(|kind| matches!(kind, crate::java::types::model::Type::Array(_)))
    }

    /// What a call can throw as far as SpotBugs looks: the declared exceptions, or what leaves the body of a
    /// method of the same class.
    fn call(&self, call: Node<'t>) -> Vec<String> {
        let Some(found) = self.context.resolver.resolve_call(call) else { return Vec::new() };
        if found.declaring != self.own {
            return declares(&found.method);
        }
        let name = call.child_by_field_name("name").map(|name| self.context.text(name)).unwrap_or_default();
        let signatures = self.signatures.get_or_init(|| {
            let named = |method: &Node| method.child_by_field_name("name").map(|declared| self.context.text(declared).to_string()).unwrap_or_default();
            self.methods.iter().map(|method| (named(method), self.context.resolver.parameters(method.child_by_field_name("parameters")).0)).collect()
        });
        let target = signatures.iter().position(|(declared, formals)| declared == name && *formals == found.method.parameters).map(|at| &self.methods[at]);
        let mut thrown = declares(&found.method);
        thrown.extend(target.map(|target| self.leaving(*target)).unwrap_or_default());
        thrown
    }

    /// `this(...)`: what leaves the constructor of the same class it names, not counting what that one gets from
    /// a further `this(...)`.
    fn delegated(&self, invocation: Node<'t>) -> Vec<String> {
        let mut arguments = invocation.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        arguments.retain(|argument| !argument.kind().ends_with("comment"));
        let resolver = self.context.resolver;
        let current = crate::engine::source::ancestor(invocation, &["constructor_declaration"]);
        let others: Vec<(Node<'t>, Vec<crate::java::types::model::Type>)> = self
            .constructors
            .iter()
            .filter(|constructor| Some(**constructor) != current)
            .map(|constructor| (*constructor, resolver.parameters(constructor.child_by_field_name("parameters")).0))
            .filter(|(_, formals)| formals.len() == arguments.len())
            .collect();
        // Types are only asked for when the number of arguments leaves a choice, and then once per argument.
        let chosen = if others.len() > 1 {
            let actual: Vec<Option<crate::java::types::model::Type>> = arguments.iter().map(|argument| resolver.type_of(*argument)).collect();
            let exact = others.iter().find(|(_, formals)| formals.iter().zip(&actual).all(|(formal, actual)| actual.as_ref().is_some_and(|actual| actual.erased().name() == formal.name())));
            let fits = others.iter().find(|(_, formals)| formals.iter().zip(&actual).all(|(formal, actual)| actual.as_ref().is_none_or(|actual| resolver.assignable(actual, formal, false))));
            exact.or(fits).or(others.first())
        } else {
            others.first()
        };
        let Some((target, _)) = chosen else { return Vec::new() };
        if self.delegating.replace(true) {
            return Vec::new();
        }
        let found = self.sites(*target);
        self.delegating.set(false);
        let mut types: Vec<String> = found.into_iter().filter(|(at, _, _)| at.kind() != "explicit_constructor_invocation").map(|(_, thrown, _)| thrown).collect();
        types.sort();
        types.dedup();
        types
    }

    fn leaving(&self, target: Node<'t>) -> Vec<String> {
        if let Some(known) = self.leaves.borrow().get(&target.id()) {
            return known.clone();
        }
        self.leaves.borrow_mut().insert(target.id(), Vec::new());
        let sites = self.sites(target);
        let mut types: Vec<String> = sites.into_iter().map(|(_, thrown, _)| thrown).collect();
        types.sort();
        types.dedup();
        self.leaves.borrow_mut().insert(target.id(), types.clone());
        types
    }

    /// The places where an exception leaves a method or constructor of the class, first one first.
    fn sites(&self, target: Node<'t>) -> Vec<Site<'t>> {
        let mut sites = Vec::new();
        let Some(body) = target.child_by_field_name("body") else { return sites };
        if target.kind() == "constructor_declaration" && delegation(body).is_none_or(|called| called != "this") {
            for member in &self.shared {
                self.walk(*member, &Guard::Open, false, &mut sites);
            }
        }
        if target.kind() != "constructor_declaration" {
            self.walk(body, &Guard::Open, true, &mut sites);
            return sites;
        }
        sites.extend(lombok::checked_parameter(self.context, target).map(|checked| (checked, "java.lang.NullPointerException".to_string(), false)));
        let mut inside = Vec::new();
        self.walk(body, &Guard::Open, false, &mut inside);
        let delegated = named_children(body).into_iter().find(|part| part.kind() == "explicit_constructor_invocation");
        if lombok::annotated(self.context, target, "SneakyThrows") {
            inside.retain(|site| within(delegated, site.0));
        }
        let (early, late): (Vec<Site<'t>>, Vec<Site<'t>>) = inside.into_iter().partition(|site| site.2 || within(delegated, site.0));
        early.into_iter().chain(sites).chain(late).collect()
    }

    /// Every place under `node`, in source order, where an exception starts that the handler around it does not
    /// take. `method` says the body is one of a method and not of a constructor.
    fn walk(&self, node: Node<'t>, guard: &Guard, method: bool, sites: &mut Vec<Site<'t>>) {
        let kind = node.kind();
        if kind == "lambda_expression" || kind == "class_body" || TYPE_DECLARATIONS.contains(&kind) {
            return;
        }
        if kind == "try_statement" || kind == "try_with_resources_statement" {
            let catches = catch_types(self.context, node);
            let cleanup = children(node).into_iter().filter(|part| part.kind() == "finally_clause").flat_map(named_children).flat_map(named_children).any(|part| !part.kind().ends_with("comment"));
            let passes = if cleanup { Guard::Passes } else { guard.clone() };
            let around = if catches.is_empty() { passes.clone() } else { Guard::Takes(catches) };
            let resources = kind == "try_with_resources_statement";
            for part in children(node) {
                match part.kind() {
                    "catch_clause" => self.walk(part, &passes, method, sites),
                    "finally_clause" => self.walk(part, guard, method, sites),
                    "block" if resources => {
                        self.walk(part, &Guard::Closes, method, sites);
                        // Without a way out of the body at its end the compiler leaves the closing call out.
                        let ends = named_children(part).into_iter().rfind(|last| !last.kind().ends_with("comment")).is_some_and(|last| last.kind() == "throw_statement");
                        let closing = if ends { Vec::new() } else { closing(self.context, node) };
                        sites.extend(closing.into_iter().filter(|thrown| !caught(self.context, thrown, &around, method)).map(|thrown| (part, thrown, false)));
                    }
                    _ => self.walk(part, &around, method, sites),
                }
            }
            return;
        }
        if kind == "synchronized_statement" {
            for part in children(node) {
                self.walk(part, if part.kind() == "block" { &Guard::Passes } else { guard }, method, sites);
            }
            return;
        }
        if kind == "explicit_constructor_invocation" {
            let mut early = Vec::new();
            for part in children(node) {
                self.walk(part, guard, method, &mut early);
            }
            // SpotBugs takes the first constructor call it meets for the `super(...)` call, so a `new` among the
            // arguments ends the early part.
            let mut created = Vec::new();
            crate::engine::source::walk(node, |inner| {
                let hidden = crate::engine::source::ancestor(inner, &["lambda_expression", "class_body"]).is_some_and(|around| around.start_byte() > node.start_byte());
                if inner.kind() == "object_creation_expression" && !hidden {
                    created.push((inner.start_byte(), inner.end_byte()));
                }
            });
            let late = |at: Node| created.iter().any(|(start, end)| *end <= at.end_byte() && !(*start <= at.start_byte() && at.end_byte() <= *end));
            sites.extend(early.into_iter().map(|(at, thrown, _)| (at, thrown, !late(at))));
            if node.child_by_field_name("constructor").is_some_and(|called| called.kind() == "this") {
                sites.extend(self.delegated(node).into_iter().filter(|thrown| !caught(self.context, thrown, guard, false)).map(|thrown| (node, thrown, false)));
            }
            return;
        }
        for part in children(node) {
            self.walk(part, guard, method, sites);
        }
        let thrown = match kind {
            "throw_statement" => {
                // A value typed `Throwable` is one a `catch (Throwable t)` passes on: SpotBugs does not count it.
                let value = node.named_child(0).and_then(|value| self.context.resolver.type_of(value));
                let thrown = value.map_or_else(|| UNKNOWN.to_string(), |kind| kind.erased().name());
                // An exception class missing from the class path is one SpotBugs cannot follow: it does not count.
                let missing = thrown != UNKNOWN && self.context.resolver.index.get(&thrown).is_none();
                if thrown == "java.lang.Throwable" || missing { Vec::new() } else { vec![thrown] }
            }
            "switch_expression" if self.may_not_match(node) => vec!["java.lang.MatchException".to_string()],
            "assert_statement" => vec!["java.lang.AssertionError".to_string()],
            "method_invocation" if self.array_clone(node) => Vec::new(),
            "method_invocation" => self.call(node),
            _ => Vec::new(),
        };
        let every = method && kind == "method_invocation";
        sites.extend(thrown.into_iter().filter(|thrown| !caught(self.context, thrown, guard, every)).map(|thrown| (node, thrown, false)));
    }
}

/// A class whose `finalize()` is final, its own or inherited, cannot be attacked this way.
fn sealed_finalizer(context: &Context, own: &str) -> bool {
    let index = context.resolver.index;
    index.lineage(own).iter().filter_map(|class| index.get(class)).any(|class| {
        class.methods.iter().any(|method| method.name == "finalize" && method.parameters.is_empty() && method.flags & flag::FINAL != 0)
    })
}

pub fn constructor_throw(context: &Context, class: Node) {
    let anonymous = class.kind() == "object_creation_expression";
    if !anonymous && (class.kind() != "class_declaration" || has_modifier(class, "final")) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = children(class).into_iter().find(|part| part.kind() == "class_body") else { return };
    if sealed_finalizer(context, &own) {
        return;
    }
    let members = children(body);
    let of_kind = |kind: &str| members.iter().filter(|member| member.kind() == kind).copied().collect::<Vec<Node>>();
    let shared: Vec<Node> = members
        .iter()
        .filter(|member| match member.kind() {
            "field_declaration" => !has_modifier(**member, "static"),
            "block" => true,
            _ => false,
        })
        .copied()
        .collect();
    let constructors = of_kind("constructor_declaration");
    let scan = Scan { context, own: &own, methods: of_kind("method_declaration"), signatures: std::cell::OnceCell::new(), constructors: constructors.clone(), shared, leaves: RefCell::new(HashMap::new()), delegating: std::cell::Cell::new(false) };
    let outer = if anonymous { None } else { crate::java::javac::instance_around(context.resolver, class) };
    let report = |declaration: Node, site: Node| {
        let label = if anonymous { names::anonymous(context, &own, class) } else { names::method(context, &own, declaration, outer.as_deref()) };
        let class = names::binary(context, &own);
        let message = format!("Exception thrown in class {class} at {label} {TAIL}");
        context.report_listed("CT_CONSTRUCTOR_THROW", declaration, site_line(context, site), message, place::function(&label), 2, vec![class, label]);
    };
    if constructors.is_empty() && (anonymous || !lombok::writes_constructors(context, class)) {
        let mut sites = Vec::new();
        for member in &scan.shared {
            scan.walk(*member, &Guard::Open, false, &mut sites);
        }
        if let Some((site, _, _)) = sites.iter().find(|site| !site.2) {
            report(class, *site);
        }
    }
    for constructor in constructors {
        if let Some((site, _, _)) = scan.sites(constructor).iter().find(|site| !site.2) {
            report(constructor, *site);
        }
    }
}

fn within(outer: Option<Node>, node: Node) -> bool {
    outer.is_some_and(|outer| outer.start_byte() <= node.start_byte() && node.end_byte() <= outer.end_byte())
}

/// `this` or `super` when a constructor body starts by calling another constructor.
fn delegation<'s>(body: Node<'s>) -> Option<&'static str> {
    let first = named_children(body).into_iter().find(|part| !part.kind().ends_with("comment")).filter(|first| first.kind() == "explicit_constructor_invocation")?;
    match first.child_by_field_name("constructor")?.kind() {
        "this" => Some("this"),
        _ => Some("super"),
    }
}

/// The call under `node` that runs last.
fn last_call<'t>(node: Node<'t>) -> Option<Node<'t>> {
    if matches!(node.kind(), "lambda_expression" | "class_body") {
        return None;
    }
    let inner = children(node).into_iter().filter_map(last_call).last();
    if node.kind() == "method_invocation" { Some(node) } else { inner }
}

/// The line of the opening parenthesis of a call, where the compiler puts it.
fn call_line(context: &Context, call: Node) -> usize {
    call.child_by_field_name("arguments").map_or(context.line(call), |list| context.line(list))
}

/// The line SpotBugs gives a site, which is the line of the last call that runs before the exception leaves:
/// the call itself, or the last call inside a `throw`.
fn site_line(context: &Context, site: Node) -> usize {
    match site.kind() {
        "method_invocation" => call_line(context, site),
        "throw_statement" | "assert_statement" => {
            children(site).into_iter().filter_map(last_call).last().map_or(context.line(site), |call| call_line(context, call))
        }
        // The closing of the resources of a `try`, which the compiler puts at the end of its body.
        "block" => site.end_position().row + 1,
        _ => context.line(site),
    }
}
