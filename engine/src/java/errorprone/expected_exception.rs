//! ExpectedExceptionChecker: `ExpectedException` rules should be replaced by `assertThrows`.
use super::Context;
use super::assert_throws::javac_statements;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::nodes::name_position;
use super::object_to_string::qualify_type;
use super::positions::arguments;
use super::truth_checks::on_descendant;
use crate::engine::source::walk;
use crate::java::types::model::Type;
use tree_sitter::Node;

const EXPECTED_EXCEPTION: &str = "org.junit.rules.ExpectedException";
const THROWABLE: &str = "java.lang.Throwable";
const MATCHER: &str = "org.hamcrest.Matcher";

fn expression_of<'t>(statement: Node<'t>) -> Option<Node<'t>> {
    (statement.kind() == "expression_statement").then(|| statement.named_child(0)).flatten().filter(|expression| expression.kind() == "method_invocation")
}

fn name_of<'a>(context: &'a Context, call: Node) -> &'a str {
    call.child_by_field_name("name").map_or("", |name| context.text(name))
}

fn is_expectation(context: &Context, statement: Node) -> bool {
    expression_of(statement).is_some_and(|call| {
        let name = name_of(context, call);
        name.starts_with("expect") && instance_on_exact_class(context, call, EXPECTED_EXCEPTION, &[name])
    })
}

fn is_failure(context: &Context, statement: Node) -> bool {
    statement.kind() == "throw_statement"
        || expression_of(statement).is_some_and(|call| name_of(context, call) == "fail" && context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static))
}

fn is_truth_assertion(context: &Context, statement: Node) -> bool {
    let Some(receiver) = expression_of(statement).and_then(|call| call.child_by_field_name("object")) else { return false };
    static_on_class(context, receiver, "com.google.common.truth.Truth", &["assertThat"]) || on_descendant(context, receiver, "com.google.common.truth.StandardSubjectBuilder", "that")
}

fn descends(context: &Context, name: &str, above: &str) -> bool {
    name == above || context.resolver.index.is_subtype(name, above)
}

fn upper_bound(kind: &Type) -> Type {
    match kind {
        Type::Bounded(false, bound) => (**bound).clone(),
        Type::Wildcard | Type::Bounded(true, _) => Type::class("java.lang.Object"),
        other => other.clone(),
    }
}

struct Plan {
    exception: Type,
    asserts: Vec<String>,
    imports: bool,
}

fn plan_expectation(context: &Context, call: Node, plan: &mut Plan) {
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let args = arguments(call);
    let Some(only) = args.first().copied() else { return };
    let source = context.text(only);
    match name_of(context, call) {
        "expect" => {
            let Some(kind) = context.resolver.type_of(only) else { return };
            if matches!(&kind, Type::Class(name, _) if descends(context, name, "java.lang.Class")) {
                let first = context.resolver.index.arguments_as(&kind, "java.lang.Class").and_then(|shown| shown.into_iter().next());
                plan.exception = first.map_or(Type::class(THROWABLE), |first| upper_bound(&first));
            } else if matches!(&kind, Type::Class(name, _) if descends(context, name, MATCHER)) {
                let shown = context.resolver.index.arguments_as(&kind, MATCHER).unwrap_or_default();
                if let [Type::Class(matched, _)] = shown.as_slice() {
                    if descends(context, matched, THROWABLE) {
                        plan.exception = shown[0].clone();
                    }
                }
                plan.imports = true;
                plan.asserts.push(format!("assertThat(thrown, {source});"));
            }
        }
        "expectCause" => {
            plan.imports = true;
            let is_a = ["org.hamcrest.Matchers", "org.hamcrest.CoreMatchers", "org.hamcrest.core.Is"].iter().any(|owner| static_on_class(context, only, owner, &["isA"]))
                && context.resolver.resolve_call(only).is_some_and(|inner| inner.method.parameters == [Type::class("java.lang.Class")]);
            if is_a {
                let inner = arguments(only);
                let Some(class) = inner.first() else { return };
                plan.asserts.push(format!("assertThat(thrown).hasCauseThat().isInstanceOf({});", context.text(*class)));
            } else {
                plan.asserts.push(format!("assertThat(thrown.getCause(), {source});"));
            }
        }
        "expectMessage" => {
            plan.imports = true;
            let string = resolved.method.parameters.first().is_some_and(|parameter| matches!(parameter, Type::Class(name, _) if name == "java.lang.String"));
            if string {
                plan.asserts.push(format!("assertThat(thrown).hasMessageThat().contains({source});"));
            } else {
                plan.asserts.push(format!("assertThat(thrown.getMessage(), {source});"));
            }
        }
        _ => {}
    }
}

fn build_fix(context: &Context, method: Node, expectations: &[Node], failure: Option<Node>, suffix: &[Node]) -> Fix {
    let mut plan = Plan { exception: Type::class(THROWABLE), asserts: Vec::new(), imports: false };
    for expectation in expectations {
        if let Some(call) = expression_of(*expectation) {
            plan_expectation(context, call, &mut plan);
        }
    }
    let first = expectations[0].start_byte();
    let last = expectations[expectations.len() - 1].end_byte();
    let mut fix = Fix::replace(first, last, "");
    if let Some(failure) = failure {
        fix = fix.delete(failure.start_byte(), failure.end_byte());
    }
    if suffix.is_empty() {
        return if plan.imports { fix.with_imports() } else { fix };
    }
    let name = match &plan.exception {
        Type::Class(name, _) => qualify_type(context, method, name),
        other => other.name(),
    };
    let mut prefix = String::new();
    if !plan.asserts.is_empty() {
        prefix.push_str(&format!("{name} thrown = "));
    }
    prefix.push_str(&format!("assertThrows({name}.class, () -> "));
    let single = suffix.len() == 1 && expression_of(suffix[0]).is_some();
    if !single {
        prefix.push('{');
    }
    fix = fix.insert(suffix[0].start_byte(), prefix);
    let joined = plan.asserts.join("\n");
    let end = suffix[suffix.len() - 1].end_byte();
    fix = match (single, expression_of(suffix[0])) {
        (true, Some(expression)) => fix.insert(expression.end_byte(), ")").insert(end, format!("\n{joined}")),
        _ => fix.insert(end, format!("}});\n{joined}")),
    };
    fix.with_imports()
}

fn scan_block(context: &Context, method: Node, block: Node) {
    let all: Vec<Node> = javac_statements(block).into_iter().map(|statement| statement.node).collect();
    let Some(begin) = all.iter().position(|statement| is_expectation(context, *statement)) else { return };
    let mut end = begin;
    while end < all.len() && is_expectation(context, all[end]) {
        end += 1;
    }
    let expectations = &all[begin..end];
    let mut suffix: Vec<Node> = all[end..].to_vec();
    let mut failure = None;
    if suffix.last().is_some_and(|last| is_failure(context, *last)) {
        failure = suffix.pop();
    }
    while suffix.last().is_some_and(|last| is_truth_assertion(context, *last)) {
        suffix.pop();
    }
    let fix = build_fix(context, method, expectations, failure, &suffix);
    context.report_fixed("ExpectedExceptionChecker", method, name_position(method), "Prefer assertThrows to ExpectedException", &[fix]);
}

pub fn expected_exception_checker(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") {
        return;
    }
    let Some(body) = method.child_by_field_name("body") else { return };
    walk(body, |node| {
        if matches!(node.kind(), "block" | "constructor_body") {
            scan_block(context, method, node);
        }
    });
}
