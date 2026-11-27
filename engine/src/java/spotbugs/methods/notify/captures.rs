//! What javac hands a lambda or a class body from the method around it, casts it leaves out, and calls on
//! type variables with several bounds.
use super::code::Code;
use crate::engine::source::{children, named_children};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::{Field, Type, flag};
use std::collections::HashSet;
use tree_sitter::Node;

impl Code<'_, '_> {
    /// A cast javac writes no `checkcast` for: to a type the value already has.
    pub(super) fn widens(&self, node: Node) -> bool {
        let resolver = self.context.resolver;
        let target = node.child_by_field_name("type").and_then(|kind| resolver.type_node(kind)).map(|kind| kind.erased());
        let source = node.child_by_field_name("value").and_then(|value| resolver.type_of(value)).map(|kind| kind.erased());
        match (source, target) {
            (Some(Type::Class(from, _)), Some(Type::Class(to, _))) => from == to || to == "java.lang.Object" || resolver.index.is_subtype(&from, &to),
            _ => false,
        }
    }

    /// Whether code of a lambda or a class body takes a local variable of the method around it, or with
    /// `outer_this` also `this`.
    pub(super) fn captures(&self, code: Node, outer_this: bool) -> bool {
        let resolver = self.context.resolver;
        let mut declared = HashSet::new();
        let mut stack = vec![code];
        let mut used = Vec::new();
        while let Some(node) = stack.pop() {
            let named = match node.kind() {
                "this" | "super" if outer_this => return true,
                "object_creation_expression" | "method_reference" if self.creates_taking(node, Some(code)) => return true,
                "method_reference" if outer_this && !self.is_static && self.creates_inner(node) => return true,
                "object_creation_expression" if outer_this && !self.is_static && (self.inner(node) || named_children(node).iter().any(|part| part.kind() == "class_body")) => return true,
                "method_invocation" if outer_this && node.child_by_field_name("object").is_none() && !resolver.resolve_call(node).is_some_and(|call| call.method.is_static) => return true,
                "identifier" => {
                    used.push(node);
                    None
                }
                "lambda_expression" => node.child_by_field_name("parameters").filter(|parameter| parameter.kind() == "identifier"),
                "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "enhanced_for_statement" | "resource" | "spread_parameter" => node.child_by_field_name("name"),
                "inferred_parameters" => {
                    declared.extend(named_children(node).into_iter().map(|name| self.context.text(name)));
                    None
                }
                _ => None,
            };
            declared.extend(named.map(|name| self.context.text(name)));
            stack.extend(named_children(node));
        }
        used.into_iter().any(|name| {
            let parent = crate::engine::source::parent(name);
            let member = parent.is_some_and(|parent| {
                (parent.kind() == "field_access" && parent.child_by_field_name("field") == Some(name)) || (parent.kind() == "method_invocation" && parent.child_by_field_name("name") == Some(name))
            });
            !member && !declared.contains(self.context.text(name)) && match resolver.binding(name, self.context.text(name)) {
                Some(Binding::Local(_)) => !self.constant_local(name),
                Some(Binding::Field(_, _, field)) => outer_this && field.flags & flag::STATIC == 0,
                None => false,
            }
        })
    }

    /// A value whose type is a type variable with several bounds: javac calls `Object`'s methods on it with
    /// `invokevirtual`, whatever its erasure.
    pub(super) fn several_bounds(&self, object: Node) -> bool {
        let resolver = self.context.resolver;
        let object = unwrap(object);
        if let Some(Type::Class(name, _)) = resolver.type_of(object) {
            if name.contains('&') {
                return true;
            }
        }
        let mut declared_in = object;
        let variable = match resolver.symbolic().type_of(object) {
            Some(Type::Variable(name)) => Some(name),
            _ => {
                let field = match object.kind() {
                    "identifier" => Some(object),
                    "field_access" if object.child_by_field_name("object").is_some_and(|owner| owner.kind() == "this") => object.child_by_field_name("field"),
                    _ => None,
                };
                // Only a field of a class around the code has the variable of that class; an inherited one has the
                // type the subclass gives it, which `type_of` already knows.
                let around = crate::java::types::scope::enclosing_types(resolver.scope, object);
                field.and_then(|field| match resolver.binding(field, self.context.text(field)) {
                    Some(Binding::Field(_, info, Field { generic: Type::Variable(name), .. })) if around.contains(&info.name) => {
                        declared_in = self.context.classes.get(&info.name).copied()?;
                        Some(name.clone())
                    }
                    _ => None,
                })
            }
        };
        let Some(parameter) = variable.and_then(|name| crate::java::types::scope::type_parameter(self.context.file, declared_in, &name)) else { return false };
        children(parameter).into_iter().find(|part| part.kind() == "type_bound").is_some_and(|bound| named_children(bound).len() > 1)
    }

    /// For a local class, its declaration and whether creating it takes variables declared outside `code` (of the
    /// method, with no `code`); `None` for any other class.
    pub(super) fn local_takes(&self, name: &str, code: Option<Node>) -> Option<(Node<'_>, bool)> {
        let local = self.context.classes.get(name).copied().filter(|declaration| crate::java::javac::declared_locally(*declaration))?;
        let captured = self.context.compiled().local_class_captured(self.context.resolver, local);
        let outside = |declared: &Node| code.is_none_or(|code| declared.start_byte() < code.start_byte() || declared.end_byte() > code.end_byte());
        Some((local, captured.iter().any(outside)))
    }

    /// `new Local(...)` or `Local::new` for a local class that takes variables declared outside `code`.
    pub(super) fn creates_taking(&self, node: Node, code: Option<Node>) -> bool {
        let written = match node.kind() {
            "object_creation_expression" => node.child_by_field_name("type"),
            "method_reference" if node.child(node.child_count().saturating_sub(1) as u32).is_some_and(|last| last.kind() == "new") => node.child(0),
            _ => None,
        };
        let kind = written.and_then(|kind| self.context.resolver.type_node(kind)).map(|kind| kind.erased());
        matches!(kind, Some(Type::Class(name, _)) if self.local_takes(&name, code).is_some_and(|(_, takes)| takes))
    }

    /// `Class::new` for a class that takes the instance around it or variables of the method: javac hands them
    /// to the lambda it writes.
    pub(super) fn creates_inner(&self, reference: Node) -> bool {
        let last = reference.child(reference.child_count().saturating_sub(1) as u32);
        last.is_some_and(|last| last.kind() == "new") && self.takes_values(reference.child(0))
    }

    /// Whether creating the class written at `written` takes the instance around it, or for a local class also
    /// variables of the method, its own or those of a local class it extends.
    pub(super) fn takes_values(&self, written: Option<Node>) -> bool {
        let kind = written.and_then(|kind| self.context.resolver.type_node(kind));
        let Some(Type::Class(name, _)) = kind.map(|kind| kind.erased()) else { return false };
        if let Some((local, takes)) = self.local_takes(&name, None) {
            // Local records, enums and interfaces are static and never take the instance.
            return takes || (!self.is_static && local.kind() == "class_declaration");
        }
        self.context.resolver.index.get(&name).is_some_and(|info| {
            let nested = info.name.rsplit_once('.').is_some_and(|(outer, _)| self.context.resolver.index.get(outer).is_some());
            nested && !info.is_interface && info.flags & (flag::STATIC | flag::ENUM | flag::RECORD) == 0
        })
    }
}
