//! AssertionFailureIgnored: a JUnit assertion in a `try` whose `catch` swallows the `AssertionError`.
use super::Context;
use super::assert_throws::javac_statements;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::positions::preferred;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::javac::locals::{declaration, Found, Scopes};
use crate::java::types::model::Type;
use tree_sitter::Node;

const OWNERS: [&str; 3] = ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"];
const ASSERTION_ERROR: &str = "java.lang.AssertionError";

fn is_assertion(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    (name == "fail" || name.starts_with("assert")) && OWNERS.iter().any(|owner| static_on_class(context, call, owner, &[name]))
}

fn enclosing_try(call: Node) -> Option<Node> {
    let mut previous = call;
    let mut current = parent(call);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "lambda_expression" => return None,
            "try_statement" | "try_with_resources_statement" => return at.child_by_field_name("body").filter(|body| *body == previous).map(|_| at),
            _ => {}
        }
        previous = at;
        current = parent(at);
    }
    None
}

fn catch_types<'t>(clause: Node<'t>) -> Vec<Node<'t>> {
    let parameter = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter");
    let types = parameter.and_then(|parameter| children(parameter).into_iter().find(|part| part.kind() == "catch_type"));
    types.map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn catches_assertion_error(context: &Context, clause: Node) -> bool {
    let index = context.resolver.index;
    catch_types(clause).into_iter().any(|kind| match context.resolver.type_node(kind) {
        Some(Type::Class(name, _)) => name == ASSERTION_ERROR || index.is_subtype(ASSERTION_ERROR, &name),
        _ => false,
    })
}

fn is_parameter(context: &Context, scopes: &Scopes, parameter: Node, node: Node) -> bool {
    node.kind() == "identifier" && matches!(declaration(context.resolver, scopes, node, context.text(node)), Some(Found::Local(declared)) if declared == parameter)
}

fn rethrows(context: &Context, clause: Node, parameter: Node) -> bool {
    let Some(block) = clause.child_by_field_name("body") else { return false };
    let scopes = Scopes::of(context.file, context.file.tree.root_node());
    let index = context.resolver.index;
    let mut found = false;
    walk(block, |part| {
        if part.kind() != "throw_statement" || found {
            return;
        }
        let Some(thrown) = named_children(part).into_iter().find(|inner| !inner.kind().ends_with("comment")) else { return };
        if is_parameter(context, &scopes, parameter, thrown) {
            found = true;
            return;
        }
        let throwable = thrown.kind() == "object_creation_expression"
            && matches!(context.resolver.type_of(thrown), Some(Type::Class(name, _)) if name == "java.lang.Throwable" || index.is_subtype(&name, "java.lang.Throwable"));
        if throwable {
            found = super::positions::arguments(thrown).into_iter().any(|argument| is_parameter(context, &scopes, parameter, argument));
        }
    });
    found
}

fn build_fix(context: &Context, tried: Node, call: Node) -> Option<Fix> {
    if call.child_by_field_name("name").map(|name| context.text(name))? != "fail" {
        return None;
    }
    let block = tried.child_by_field_name("body")?;
    let all = javac_statements(block);
    let last = all.last()?.node;
    if last.kind() != "expression_statement" || last.named_child(0) != Some(call) {
        return None;
    }
    let clauses: Vec<Node> = children(tried).into_iter().filter(|part| part.kind() == "catch_clause").collect();
    let [clause] = clauses.as_slice() else { return None };
    let parameter = children(*clause).into_iter().find(|part| part.kind() == "catch_formal_parameter")?;
    let types = catch_types(*clause);
    let [caught] = types.as_slice() else { return None };
    let expression = all.len() == 2 && all[0].node.kind() == "expression_statement";
    let (start, end) = if expression {
        (all[0].node.start_byte(), all[0].node.named_child(0)?.end_byte())
    } else {
        (block.start_byte(), last.start_byte())
    };
    let wrap = |text: &str| format!("{}{text}", if expression { "" } else { "}" });
    let catch_body = clause.child_by_field_name("body")?;
    let catch_statements = super::assert_throws::block_statements(catch_body);
    let head = |lead: &str| format!("{lead}assertThrows({}.class, () -> ", context.text(*caught));
    let fix = match (catch_statements.first(), catch_statements.last()) {
        (Some(first), Some(last_statement)) => Fix::new()
            .insert(tried.start_byte(), context.text(parameter))
            .and(tried.start_byte(), start, head(" = "))
            .and(end, first.start_byte(), wrap(");\n"))
            .and(last_statement.end_byte(), clause.end_byte(), ""),
        _ => Fix::replace(tried.start_byte(), start, head("")).and(end, clause.end_byte(), wrap(");\n")),
    };
    Some(fix.with_imports())
}

pub fn assertion_failure_ignored(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !is_assertion(context, call) {
        return;
    }
    let Some(tried) = enclosing_try(call) else { return };
    let Some(clause) = children(tried).into_iter().filter(|part| part.kind() == "catch_clause").find(|clause| catches_assertion_error(context, *clause)) else { return };
    let Some(parameter) = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { return };
    if rethrows(context, clause, parameter) {
        return;
    }
    let fixes: Vec<Fix> = build_fix(context, tried, call).into_iter().collect();
    let message = "This assertion throws an AssertionError if it fails, which will be caught by an enclosing try block.";
    context.report_fixed("AssertionFailureIgnored", call, preferred(context, call), message, &fixes);
}
