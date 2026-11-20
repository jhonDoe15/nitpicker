//! `lambda$method$3`: the name of the hidden method the compiler makes for a lambda. Each class counts its own
//! lambdas from zero in source order, a lambda inside another one first.
use super::{Names, Synthetic, references};
use crate::engine::source::children;
use crate::java::helpers::has_modifier;
use crate::java::types::scope::{Resolver, TYPE_DECLARATIONS};
use tree_sitter::Node;

fn local_name(class: &str) -> bool {
    class.split('.').any(|part| part.starts_with(|first: char| first.is_ascii_digit()))
}

/// The part of a lambda's name that says where it is written: the method, `new` for constructors and instance
/// initializers, `static` for static ones. A field of a local or anonymous class gives the class's own name.
fn place(resolver: &Resolver, member: Node, holder: Node, class: &str) -> Option<String> {
    let simple = || class.rsplit('.').next().unwrap_or_default().trim_start_matches(|c: char| c.is_ascii_digit()).to_string();
    let fixed = |text: &str| Some(text.to_string());
    match member.kind() {
        "method_declaration" => member.child_by_field_name("name").map(|name| resolver.file.text_of(name).to_string()),
        "constructor_declaration" | "compact_constructor_declaration" | "block" => fixed("new"),
        "static_initializer" => fixed("static"),
        "field_declaration" | "constant_declaration" | "enum_constant" if local_name(class) => Some(simple()),
        "constant_declaration" | "enum_constant" => fixed("static"),
        "field_declaration" if holder.kind() == "interface_body" || has_modifier(member, "static") => fixed("static"),
        "field_declaration" => fixed("new"),
        _ => None,
    }
}

pub struct Numbering<'c, 'a, 't> {
    pub resolver: &'c Resolver<'a>,
    pub names: &'c mut Names<'t>,
}

impl<'t> Numbering<'_, '_, 't> {
    /// Numbers the lambdas written directly in a class body; classes inside it are numbered on their own.
    pub fn class(&mut self, body: Node<'t>, class: &str) {
        let mut count = 0;
        self.members(body, class, &mut count);
    }

    fn members(&mut self, body: Node<'t>, class: &str, count: &mut u32) {
        for member in children(body) {
            if member.kind() == "enum_body_declarations" {
                self.members(member, class, count);
            } else if TYPE_DECLARATIONS.contains(&member.kind()) {
                self.declared(member);
            } else if let Some(place) = place(self.resolver, member, body, class) {
                self.inside(member, class, &place, count);
            }
        }
    }

    fn declared(&mut self, declaration: Node<'t>) {
        let Some(name) = self.resolver.scope.names.get(&declaration.id()).cloned() else { return };
        if let Some(body) = declaration.child_by_field_name("body") {
            self.class(body, &name);
        }
    }

    fn inside(&mut self, node: Node<'t>, class: &str, place: &str, count: &mut u32) {
        for child in children(node) {
            let kind = child.kind();
            if TYPE_DECLARATIONS.contains(&kind) {
                self.declared(child);
                continue;
            }
            if kind == "class_body" {
                if let Some(name) = self.resolver.scope.names.get(&node.id()).cloned() {
                    self.class(child, &name);
                }
                continue;
            }
            self.inside(child, class, place, count);
            let numbered = match kind {
                "lambda_expression" if references::serializable(self.resolver, child) => {
                    self.names.lambdas.insert(child.id(), Synthetic { owner: class.to_string(), name: None });
                    false
                }
                "lambda_expression" => true,
                "method_reference" => references::becomes_lambda(self.resolver, child),
                _ => false,
            };
            if numbered {
                self.names.lambdas.insert(child.id(), Synthetic { owner: class.to_string(), name: Some(format!("lambda${place}${count}")) });
                *count += 1;
            }
        }
    }
}
