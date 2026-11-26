//! The local variables a lambda or a local class takes from the method around it. The compiler passes each one
//! as an extra parameter, in the order the body first names them.
use super::Names;
use super::locals::{self, Found};
use crate::engine::source::children;
use crate::java::types::model::Type;
use crate::java::types::scope::{Resolver, TYPE_DECLARATIONS};
use tree_sitter::Node;

/// One captured variable: where it is declared, and its type when known.
pub type Captured<'t> = (Node<'t>, Option<Type>);

fn holds(outer: Node, part: Node) -> bool {
    outer.start_byte() <= part.start_byte() && part.end_byte() <= outer.end_byte()
}

/// The local class a `new Local(...)` or `Local::new` creates, when it is declared in a method of this file.
fn created_local<'t>(resolver: &Resolver, names: &Names<'t>, node: Node<'t>) -> Option<Node<'t>> {
    let written = match node.kind() {
        "object_creation_expression" => node.child_by_field_name("type")?,
        "method_reference" if node.child(node.child_count().checked_sub(1)? as u32).is_some_and(|last| last.kind() == "new") => node.child(0)?,
        _ => return None,
    };
    let written = if written.kind() == "generic_type" { written.named_child(0)? } else { written };
    if !matches!(written.kind(), "type_identifier" | "identifier") {
        return None;
    }
    let class = resolver.class_name(node, resolver.file.text_of(written))?;
    names.locals.get(&class).copied()
}

/// The local class a local or anonymous class extends, when there is one: its variables are handed on to it,
/// and the compiler lists them first, last one first.
fn parent_local<'t>(resolver: &Resolver, names: &Names<'t>, class: Node<'t>) -> Option<Node<'t>> {
    if class.kind() == "object_creation_expression" {
        return created_local(resolver, names, class);
    }
    let written = class.child_by_field_name("superclass")?.named_child(0)?;
    let written = if written.kind() == "generic_type" { written.named_child(0)? } else { written };
    let above = resolver.class_name(class, resolver.file.text_of(written))?;
    names.locals.get(&above).copied()
}

struct Collector<'c, 'a, 't> {
    resolver: &'c Resolver<'a>,
    names: &'c Names<'t>,
    region: Node<'t>,
    found: Vec<Captured<'t>>,
    /// Local classes already looked into, so that two that create each other end.
    seen: Vec<usize>,
}

impl<'t> Collector<'_, '_, 't> {
    fn add(&mut self, captured: Captured<'t>) {
        if !self.found.iter().any(|known| known.0.id() == captured.0.id()) {
            self.found.push(captured);
        }
    }

    fn walk(&mut self, node: Node<'t>) {
        if node.kind() == "identifier" && locals::is_use(node) {
            let name = self.resolver.file.text_of(node);
            if let Some(Found::Local(declared)) = locals::declaration(self.resolver, &self.names.patterns, node, name) {
                let outside = !holds(self.region, declared);
                if outside && !(declared.kind() == "variable_declarator" && locals::constant(self.resolver, &self.names.patterns, declared)) {
                    self.add((declared, locals::kind(self.resolver, declared, node, name)));
                }
            }
            return;
        }
        if let Some(local) = created_local(self.resolver, self.names, node).filter(|local| !holds(self.region, *local)) {
            if !self.seen.contains(&local.id()) {
                self.seen.push(local.id());
                for captured in of_class(self.resolver, self.names, local, &mut self.seen) {
                    self.add(captured);
                }
            }
        }
        for child in children(node) {
            self.walk(child);
        }
    }
}

/// Only variables of the method the class is written in count: one from further out is reached through the
/// instance of the class in between, which holds it already. Inside a lambda every variable counts, because the
/// lambda's hidden method has them all as parameters.
fn of_class<'t>(resolver: &Resolver, names: &Names<'t>, class: Node<'t>, seen: &mut Vec<usize>) -> Vec<Captured<'t>> {
    let inherited = parent_local(resolver, names, class).filter(|above| !seen.contains(&above.id())).map(|above| {
        seen.push(above.id());
        let mut taken = of_class(resolver, names, above, seen);
        taken.reverse();
        taken
    });
    let mut collector = Collector { resolver, names, region: class, found: inherited.unwrap_or_default(), seen: std::mem::take(seen) };
    let bodies: Vec<Node> = if TYPE_DECLARATIONS.contains(&class.kind()) {
        children(class)
    } else {
        children(class).into_iter().filter(|part| part.kind() == "class_body").collect()
    };
    for body in bodies {
        collector.walk(body);
    }
    *seen = collector.seen;
    let around = crate::engine::source::ancestor(class, &["class_body", "enum_body", "interface_body", "lambda_expression"]).filter(|around| around.kind() != "lambda_expression");
    collector.found.retain(|(declared, _)| around.is_none_or(|around| holds(around, *declared) || compact_parameter(around, class, *declared)));
    collector.found
}

/// A record component named inside the compact constructor is that constructor's parameter.
fn compact_parameter(body: Node, class: Node, declared: Node) -> bool {
    let record = body.parent().filter(|record| record.kind() == "record_declaration");
    let listed = record.and_then(|record| record.child_by_field_name("parameters"));
    let compact = crate::engine::source::ancestor(class, &["compact_constructor_declaration"]);
    listed.is_some_and(|listed| declared.parent() == Some(listed)) && compact.is_some_and(|compact| compact.parent() == Some(body))
}

/// What a lambda takes from around it, first use first.
pub fn of_lambda<'t>(resolver: &Resolver, names: &Names<'t>, lambda: Node<'t>) -> Vec<Captured<'t>> {
    let mut collector = Collector { resolver, names, region: lambda, found: Vec::new(), seen: Vec::new() };
    if let Some(body) = lambda.child_by_field_name("body") {
        collector.walk(body);
    }
    collector.found
}

/// What a local or anonymous class takes from the method it is declared in. `class` is the declaration, or the
/// `new` expression or enum constant that carries the body.
pub fn of_local_class<'t>(resolver: &Resolver, names: &Names<'t>, class: Node<'t>) -> Vec<Captured<'t>> {
    of_class(resolver, names, class, &mut vec![class.id()])
}
