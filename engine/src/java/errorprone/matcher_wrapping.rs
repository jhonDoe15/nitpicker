//! UnnecessaryMethodInvocationMatcher: `methodInvocation(...)` around something that already matches a method.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::method_call_checks::expression_subtype;
use super::positions::{arguments, preferred};
use tree_sitter::Node;

const MATCHERS: &str = "com.google.errorprone.matchers.Matchers";
const METHOD_MATCHER: &str = "com.google.errorprone.matchers.method.MethodMatchers.MethodMatcher";

fn contains_only_method_matchers(context: &Context, expression: Node) -> bool {
    if context.resolver.index.has(METHOD_MATCHER) && expression_subtype(context, expression, METHOD_MATCHER) {
        return true;
    }
    if !static_on_class(context, expression, MATCHERS, &["allOf", "anyOf", "not"]) {
        return false;
    }
    arguments(expression).into_iter().all(|argument| contains_only_method_matchers(context, argument))
}

pub fn unnecessary_method_invocation_matcher(context: &Context, call: Node) {
    if !static_on_class(context, call, MATCHERS, &["methodInvocation"]) {
        return;
    }
    let list = arguments(call);
    let [argument] = list.as_slice() else { return };
    if !contains_only_method_matchers(context, *argument) {
        return;
    }
    let fix = Fix::replace(call.start_byte(), call.end_byte(), context.text(*argument));
    context.report_fixed("UnnecessaryMethodInvocationMatcher", call, preferred(context, call), "It is not necessary to wrap a MethodMatcher with methodInvocation().", &[fix]);
}
