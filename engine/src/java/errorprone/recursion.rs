//! InfiniteRecursion: a method that calls itself before it can have returned.
use super::Context;
use super::positions::{arguments, preferred};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "This method calls itself unconditionally; it will throw StackOverflowError";

struct Search<'a, 'c> {
    context: &'a Context<'c>,
    method: Node<'a>,
    own: String,
    name: String,
    parameters: Vec<String>,
    overridable: bool,
    returned: bool,
}

fn signature(context: &Context, method: Node) -> Option<Vec<String>> {
    let (erased, _, _) = context.resolver.parameters(method.child_by_field_name("parameters"));
    Some(erased.iter().map(Type::name).collect())
}

fn this_like(object: Option<Node>, context: &Context) -> bool {
    let Some(object) = object else { return true };
    let object = unwrap(object);
    object.kind() == "this" || object.kind() == "field_access" && context.text(object).ends_with(".this") && object.child_by_field_name("field").is_some_and(|field| context.text(field) == "this")
}

impl Search<'_, '_> {
    fn is_self_call(&self, call: Node) -> bool {
        if call.child_by_field_name("name").is_none_or(|name| self.context.text(name) != self.name) || arguments(call).len() != self.parameters.len() {
            return false;
        }
        let Some(resolved) = self.context.resolver.resolve_call(call) else { return false };
        if resolved.declaring != self.own || resolved.method.name != self.name {
            return false;
        }
        let key: Vec<String> = resolved.method.parameters.iter().map(|kind| kind.erased().name()).collect();
        key == self.parameters && (!self.overridable || this_like(call.child_by_field_name("object"), self.context))
    }

    fn visit(&mut self, node: Node, conditional: bool) {
        match node.kind() {
            "lambda_expression" | "class_body" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "catch_clause" => return,
            "method_invocation" if !conditional && !self.returned && self.is_self_call(node) => {
                self.context.report_fixed("InfiniteRecursion", node, preferred(self.context, node), MESSAGE, &[]);
            }
            "binary_expression" if node.child_by_field_name("operator").is_some_and(|operator| matches!(self.context.text(operator), "&&" | "||")) => {
                if let Some(left) = node.child_by_field_name("left") {
                    self.visit(left, conditional);
                }
                return;
            }
            "ternary_expression" => {
                if let Some(condition) = node.child_by_field_name("condition") {
                    self.visit(condition, conditional);
                }
                return;
            }
            _ => {}
        }
        for index in 0..node.child_count() {
            let Some(child) = node.child(index) else { continue };
            let field = node.field_name_for_child(index as u32);
            let inner = match (node.kind(), field) {
                ("if_statement", Some("consequence" | "alternative")) => true,
                ("while_statement" | "for_statement" | "enhanced_for_statement" | "switch_expression", Some("body")) => true,
                ("for_statement", Some("update")) => continue,
                _ => conditional,
            };
            self.visit(child, inner);
        }
        if node.kind() == "return_statement" {
            self.returned = true;
        }
    }
}

pub fn infinite_recursion(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let (Some(body), Some(name)) = (method.child_by_field_name("body"), method.child_by_field_name("name")) else { return };
    let Some(class) = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, method) else { return };
    let Some(parameters) = signature(context, method) else { return };
    let owner = super::junit_init::enclosing_class(method);
    let final_class = owner.is_some_and(|owner| has_modifier(owner, "final") || owner.kind() == "record_declaration");
    let overridable = !(has_modifier(method, "static") || has_modifier(method, "private") || has_modifier(method, "final") || final_class);
    let mut search = Search { context, method, own: class, name: context.text(name).to_string(), parameters, overridable, returned: false };
    let _ = search.method;
    search.visit(body, false);
}
