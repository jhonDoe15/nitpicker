//! `no-expanding-replacement-string`: a replacement that is not a constant, given to `replace` or `replaceAll`,
//! whose `$` sequences are expanded instead of inserted.
use super::dollar_guards::has_dollar_guard;
use super::replacement_values::is_safe_replacement;
use crate::typescript::rules::Context;
use crate::typescript::rules::patterns::syntax::callee_name_of;
use crate::typescript::rules::signatures::Scope;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-expanding-replacement-string";

fn message(method: &str, value: &str) -> String {
    format!(
        "`{method}` reads `$&`, `$1`, `$$` and similar sequences in a replacement string, so a `$` in `{value}` is expanded instead of inserted. Pass a function (`{method}(pattern, () => {value})`), or escape the dollars (`value.replace(/\\$/g, '$$$$')`). A constant replacement that uses `$1` on purpose is fine."
    )
}

fn replacement_of<'v>(call: Node<'v>) -> Option<(Node<'v>, Node<'v>, String)> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let method = callee_name_of(callee).filter(|method| method == "replace" || method == "replaceAll")?;
    let arguments = call.nodes("arguments");
    let replacement = arguments.get(1).copied().filter(|replacement| arguments.len() == 2 && !replacement.is("SpreadElement"))?;
    Some((callee.node("object")?, replacement, method))
}

fn expands(scope: &Scope, object: Node, replacement: Node) -> bool {
    let answer = |found: Option<bool>| {
        found.unwrap_or_else(|| {
            scope.types.borrow_mut().refuse("no type for a replacement");
            false
        })
    };
    let (start, end) = (replacement.start(), replacement.end());
    let string = scope.types.borrow_mut().is_string_at(object.start(), object.end());
    if !answer(string) || answer(scope.types.borrow_mut().is_callable_at(start, end)) {
        return false;
    }
    !is_safe_replacement(scope, replacement) && !has_dollar_guard(scope.text, replacement)
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let scope = Scope { scopes, types, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some((object, replacement, method)) = replacement_of(node) else { continue };
        if expands(&scope, object, replacement) {
            let value = &scope.text[replacement.start() as usize..replacement.end() as usize];
            found.push((replacement.start(), replacement.end(), message(&method, value)));
        }
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
