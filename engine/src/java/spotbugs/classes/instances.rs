//! What the methods of a class do with instances of it: which static fields they store a new instance in, what
//! they return, and where they test a field against `null`.
use super::super::Context;
use super::Shape;
use crate::engine::source::{children, named_children};
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::HashMap;
use tree_sitter::Node;

/// The nodes of a method's own code: not those of classes declared inside nor of lambdas.
pub fn own_code<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>) {
    for part in children(node) {
        if part.kind() == "class_body" || part.kind() == "lambda_expression" || TYPE_DECLARATIONS.contains(&part.kind()) {
            continue;
        }
        out.push(part);
        own_code(part, out);
    }
}

/// Whether an expression creates an instance of exactly the class, not of a subclass written in place.
pub fn creates(context: &Context, shape: &Shape, expression: Node) -> bool {
    let expression = crate::java::types::expr::unwrap(expression);
    expression.kind() == "object_creation_expression"
        && !children(expression).iter().any(|part| part.kind() == "class_body")
        && expression.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).is_some_and(|kind| kind.erased().name() == shape.own)
}

/// What a value a method returns holds: a static field of the class, a new instance, or something else.
#[derive(PartialEq)]
pub enum Held {
    Field(String),
    Created,
    Other,
}

pub struct Method<'t> {
    pub code: Vec<Node<'t>>,
    pub single: HashMap<String, Node<'t>>,
}

impl<'t> Method<'t> {
    pub fn of(context: &Context, declaration: Node<'t>) -> Method<'t> {
        let mut code = Vec::new();
        own_code(declaration, &mut code);
        let mut values: HashMap<String, Vec<Option<Node<'t>>>> = HashMap::new();
        for node in &code {
            match node.kind() {
                "variable_declarator" if crate::engine::source::parent(*node).is_some_and(|holder| holder.kind() == "local_variable_declaration") => {
                    let Some(name) = node.child_by_field_name("name") else { continue };
                    values.entry(context.text(name).to_string()).or_default().extend(node.child_by_field_name("value").map(Some));
                }
                "assignment_expression" | "update_expression" => {
                    let target = node.child_by_field_name("left").or_else(|| named_children(*node).into_iter().next());
                    if let Some(target) = target.filter(|target| target.kind() == "identifier") {
                        let plain = node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=");
                        values.entry(context.text(target).to_string()).or_default().push(node.child_by_field_name("right").filter(|_| plain));
                    }
                }
                _ => {}
            }
        }
        let single = values.into_iter().filter_map(|(name, list)| {
            let null = |value: &Option<Node>| value.is_some_and(|value| crate::java::types::expr::unwrap(value).kind() == "null_literal");
            match list.into_iter().filter(|value| !null(value)).collect::<Vec<_>>().as_slice() {
                [Some(value)] => Some((name, *value)),
                _ => None,
            }
        });
        Method { code, single: single.collect() }
    }

    pub fn held(&self, context: &Context, shape: &Shape, value: Node, depth: usize) -> Held {
        let value = crate::java::types::expr::unwrap(value);
        if value.kind() == "cast_expression"
            && let Some(inner) = value.child_by_field_name("value")
        {
            return self.held(context, shape, inner, depth);
        }
        if creates(context, shape, value) {
            return Held::Created;
        }
        if value.kind() == "identifier" && depth < 8 {
            let local = matches!(context.resolver.binding(value, context.text(value)), Some(crate::java::types::expr::Binding::Local(_)));
            if local {
                return self.single.get(context.text(value)).map_or(Held::Other, |init| self.held(context, shape, *init, depth + 1));
            }
        }
        match super::super::fields::field_key(context, value) {
            Some((class, name)) if class == shape.own && shape.statics.contains(&name) => Held::Field(name),
            _ => Held::Other,
        }
    }

    pub fn returned(&self, context: &Context, shape: &Shape) -> Vec<Held> {
        self.code
            .iter()
            .filter(|node| node.kind() == "return_statement")
            .filter_map(|node| node.named_child(0))
            .map(|value| self.held(context, shape, value, 0))
            .collect()
    }

    /// Whether a test that the static field is `null` leads to code that stores a new instance in it before it
    /// calls any method or takes a lock: the branch of an `if` or the body of a `while` that holds when the field is
    /// `null`, or the statements after an `if` that holds when it is not.
    pub fn creates_when_null(&self, context: &Context, shape: &Shape, field: &str) -> bool {
        self.code.iter().any(|node| {
            let condition = node.child_by_field_name("condition");
            let region = match node.kind() {
                "if_statement" | "while_statement" if condition.is_some_and(|condition| self.compares(context, shape, field, condition, "==")) => {
                    node.child_by_field_name(if node.kind() == "if_statement" { "consequence" } else { "body" }).into_iter().collect()
                }
                "if_statement" if node.child_by_field_name("alternative").is_none() && condition.is_some_and(|condition| self.compares(context, shape, field, condition, "!=")) => {
                    std::iter::successors(node.next_named_sibling(), |next| next.next_named_sibling()).collect()
                }
                _ => Vec::new(),
            };
            let mut code = Vec::new();
            for statement in region {
                code.push(statement);
                own_code(statement, &mut code);
            }
            code.into_iter().find(|part| matches!(part.kind(), "method_invocation" | "synchronized_statement") || self.stores_new(context, shape, *part).is_some()).is_some_and(|part| self.stores_new(context, shape, part).as_deref() == Some(field))
        })
    }

    /// Whether a condition compares the static field with `null` by `operator`, alone or as a part of an `&&`.
    fn compares(&self, context: &Context, shape: &Shape, field: &str, condition: Node, operator: &str) -> bool {
        let condition = crate::java::types::expr::unwrap(condition);
        if condition.kind() != "binary_expression" {
            return false;
        }
        let written = condition.child_by_field_name("operator").map(|written| context.text(written));
        let sides = [condition.child_by_field_name("left"), condition.child_by_field_name("right")];
        if written == Some("&&") && operator == "==" {
            return sides.iter().flatten().any(|side| self.compares(context, shape, field, *side, operator));
        }
        let null = sides.iter().flatten().any(|side| side.kind() == "null_literal");
        written == Some(operator) && null && sides.iter().flatten().any(|side| self.held(context, shape, *side, 0) == Held::Field(field.to_string()))
    }

    /// The static field of the class an assignment stores a new instance in.
    fn stores_new(&self, context: &Context, shape: &Shape, node: Node) -> Option<String> {
        if node.kind() != "assignment_expression" {
            return None;
        }
        let (target, value) = (node.child_by_field_name("left")?, node.child_by_field_name("right")?);
        if self.held(context, shape, value, 0) != Held::Created {
            return None;
        }
        super::super::fields::field_key(context, target).filter(|(class, name)| *class == shape.own && shape.statics.contains(name)).map(|(_, name)| name)
    }

    /// The static fields of the class this code stores a new instance in, in the order of the stores.
    pub fn creations(&self, context: &Context, shape: &Shape) -> Vec<String> {
        self.code.iter().filter_map(|node| self.stores_new(context, shape, *node)).collect()
    }
}
