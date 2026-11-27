//! The exception types the code of a `try` can throw, as SpotBugs counts them: what each call and constructor
//! declares, the static type of each `throw`, `close()` of each resource and `Throwable` for the code javac adds
//! around resources and `synchronized` blocks. SpotBugs finds no exceptions for a method
//! called on an interface. A type variable in a `throws` clause counts as its bound, as javac writes it.
use super::super::Context;
use crate::engine::source::children;
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::BTreeSet;
use tree_sitter::Node;

const THROWABLE: &str = "java.lang.Throwable";

/// What the code of a `try` can throw, by where in the source each type comes from.
pub struct Thrown {
    found: Vec<(usize, String)>,
    /// Where a call or `throw` could not be resolved.
    lost: Vec<usize>,
    /// The code calls or creates anything.
    pub calls: bool,
}

impl Thrown {
    /// The types the code between two source offsets can throw, `None` when one of them is unknown.
    pub fn within(&self, start: usize, end: usize) -> Option<BTreeSet<String>> {
        let inside = |at: &usize| (start..end).contains(at);
        if self.lost.iter().any(inside) {
            return None;
        }
        Some(self.found.iter().filter(|(at, _)| inside(at)).map(|(_, kind)| kind.clone()).collect())
    }
}

struct Gather<'c, 'a> {
    context: &'c Context<'a>,
    thrown: Thrown,
}

impl Gather<'_, '_> {
    fn declared(&mut self, at: usize, listed: Option<Vec<Type>>) {
        match listed {
            Some(listed) => self.thrown.found.extend(listed.iter().map(|kind| (at, kind.erased().name()))),
            None => self.thrown.lost.push(at),
        }
    }

    fn close(&mut self, resource: Node) {
        let at = resource.start_byte();
        self.thrown.found.push((at, THROWABLE.to_string()));
        let kind = resource_type(self.context, resource);
        let Some(Type::Class(name, _)) = kind.map(|kind| kind.erased()) else {
            self.thrown.lost.push(at);
            return;
        };
        if self.context.resolver.index.get(&name).is_some_and(|info| info.is_interface) {
            return;
        }
        let closes = self.context.resolver.index.methods(&name, "close").into_iter().find(|(_, method)| method.parameters.is_empty()).map(|(_, method)| method.throws.clone());
        self.declared(at, closes);
    }

    /// The `throws` clause of the called method as its class file lists it: a type variable as its bound.
    fn erased_throws(&self, node: Node) -> Option<Vec<Type>> {
        let resolver = self.context.resolver;
        let (call, _) = resolver.call_formals(node)?;
        let method = &call.method;
        let class_bound = |name: &str| resolver.index.get(&call.declaring).and_then(|info| info.type_parameters.iter().find(|(own, _)| own == name).map(|(_, bound)| bound.clone()));
        let listed = method.throws.iter().map(|thrown| match thrown {
            Type::Variable(name) => {
                let own = method.type_parameters.iter().position(|own| own == name).and_then(|at| method.type_bounds.get(at).cloned());
                own.or_else(|| class_bound(name)).map_or_else(|| Type::class(THROWABLE), |bound| bound.erased())
            }
            other => other.erased(),
        });
        Some(listed.collect())
    }

    /// Whether a call is `clone()` of an array, which declares no exception.
    fn array_clone(&self, node: Node) -> bool {
        node.kind() == "method_invocation"
            && node.child_by_field_name("name").is_some_and(|name| self.context.text(name) == "clone")
            && node.child_by_field_name("object").and_then(|object| self.context.resolver.type_of(object)).is_some_and(|kind| matches!(kind, Type::Array(_)))
    }

    /// Whether a call is made on an interface: SpotBugs finds no exceptions for it.
    fn through_interface(&self, node: Node) -> bool {
        if node.kind() != "method_invocation" {
            return false;
        }
        let index = self.context.resolver.index;
        let interface = |name: &str| index.get(name).is_some_and(|info| info.is_interface);
        self.context.resolver.resolve_call(node).is_some_and(|call| {
            matches!(&call.receiver, Type::Class(name, _) if interface(name)) && !call.method.is_static
        })
    }

    fn visit(&mut self, node: Node) {
        let resolver = self.context.resolver;
        match node.kind() {
            "lambda_expression" | "class_body" => return,
            kind if TYPE_DECLARATIONS.contains(&kind) => return,
            "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" => {
                self.thrown.calls = true;
                if !self.through_interface(node) && !self.array_clone(node) {
                    let listed = self.erased_throws(node);
                    self.declared(node.start_byte(), listed);
                }
            }
            "throw_statement" => match node.named_child(0).and_then(|thrown| resolver.type_of(thrown)) {
                Some(kind) => self.thrown.found.push((node.start_byte(), kind.erased().name())),
                None => self.thrown.lost.push(node.start_byte()),
            },
            "synchronized_statement" => self.thrown.found.push((node.start_byte(), THROWABLE.to_string())),
            "try_with_resources_statement" => {
                if let Some(resources) = node.child_by_field_name("resources") {
                    children(resources).into_iter().filter(|part| part.kind() == "resource").for_each(|resource| self.close(resource));
                }
            }
            _ => {}
        }
        for part in children(node) {
            self.visit(part);
        }
    }
}

/// The type of a resource: its written type, else (`var`, or a variable named alone) the type of its value.
pub fn resource_type(context: &Context, resource: Node) -> Option<Type> {
    let written = resource.child_by_field_name("type").filter(|kind| context.text(*kind) != "var").and_then(|kind| context.resolver.type_node(kind));
    let value = || resource.child_by_field_name("value").or_else(|| resource.named_child(0)).and_then(|value| context.resolver.type_of(value));
    written.or_else(value)
}

/// What the code of the `try` (its resources and body) can throw.
pub fn thrown(context: &Context, tried: Node) -> Thrown {
    let mut gather = Gather { context, thrown: Thrown { found: Vec::new(), lost: Vec::new(), calls: false } };
    if tried.kind() == "try_with_resources_statement" {
        if let Some(resources) = tried.child_by_field_name("resources") {
            children(resources).into_iter().filter(|part| part.kind() == "resource").for_each(|resource| gather.close(resource));
            gather.visit(resources);
        }
    }
    if let Some(body) = tried.child_by_field_name("body") {
        gather.visit(body);
    }
    gather.thrown
}
