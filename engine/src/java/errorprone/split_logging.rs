//! FloggerSplitLogStatement: a method or variable of a Flogger `LoggingApi` type outside the logger classes.
use super::Context;
use super::junit_init::enclosing_class;
use super::nodes::name_position;
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

const API: &str = "com.google.common.flogger.LoggingApi";
const LOGGER: &str = "com.google.common.flogger.AbstractLogger";
const MESSAGE: &str = "Splitting log statements and using Api instances directly breaks logging.";

fn logging_api(context: &Context, kind: &Type) -> bool {
    matches!(kind, Type::Class(name, _) if context.resolver.index.is_subtype(name, API))
}

fn outside_loggers(context: &Context, node: Node) -> bool {
    let Some(class) = enclosing_class(node) else { return true };
    let Some(name) = context.resolver.scope.names.get(&class.id()) else { return true };
    let index = context.resolver.index;
    !index.is_subtype(name, LOGGER) && !index.is_subtype(name, API)
}

fn inferred(context: &Context, declarator: Option<Node>, name: Node) -> Option<Type> {
    match declarator {
        Some(declarator) => context.resolver.type_of(declarator.child_by_field_name("value")?),
        None => match context.resolver.binding(name, context.text(name))? {
            Binding::Local(kind) => kind,
            Binding::Field(..) => None,
        },
    }
}

fn variable(context: &Context, declaration: Node, declarator: Option<Node>, name: Node) {
    let kind = context.resolver.declared_type(declaration, declarator).or_else(|| inferred(context, declarator, name));
    if kind.is_some_and(|kind| logging_api(context, &kind)) && outside_loggers(context, declaration) {
        context.report_fixed("FloggerSplitLogStatement", declaration, name.start_byte(), MESSAGE, &[]);
    }
}

pub fn flogger_split_log_statement(context: &Context, node: Node) {
    match node.kind() {
        "method_declaration" => {
            let returns = node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind));
            if returns.is_some_and(|kind| logging_api(context, &kind)) && outside_loggers(context, node) {
                context.report_fixed("FloggerSplitLogStatement", node, name_position(node), MESSAGE, &[]);
            }
        }
        "field_declaration" | "local_variable_declaration" => {
            for declarator in crate::java::helpers::declarators(node) {
                if let Some(name) = declarator.child_by_field_name("name") {
                    variable(context, node, Some(declarator), name);
                }
            }
        }
        "formal_parameter" | "catch_formal_parameter" | "resource" | "enhanced_for_statement" => {
            if let Some(name) = node.child_by_field_name("name") {
                variable(context, node, None, name);
            }
        }
        "inferred_parameters" => {
            for name in crate::engine::source::children(node).into_iter().filter(|part| part.kind() == "identifier") {
                variable(context, name, None, name);
            }
        }
        "lambda_expression" => {
            if let Some(name) = node.child_by_field_name("parameters").filter(|part| part.kind() == "identifier") {
                variable(context, name, None, name);
            }
        }
        _ => {}
    }
}
