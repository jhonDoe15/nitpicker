//! What javac hands a lambda or a class body from the method around it, and casts it leaves out.
use super::code::Code;
use crate::engine::source::named_children;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
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
}
