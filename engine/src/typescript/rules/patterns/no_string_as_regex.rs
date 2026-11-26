//! `no-string-as-regex`: a string passed to `match`, `matchAll` or `search`, and a regular expression built from a
//! runtime string that was not escaped.
use super::input_dependence::depends_on_input;
use super::syntax::{callee_name_of, operands_of, resolve_constant, string_value, unwrapped};
use crate::typescript::rules::Context;
use crate::typescript::rules::signatures::{Scope, name_of};
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-string-as-regex";
const PATTERN_METHODS: [&str; 3] = ["match", "matchAll", "search"];

fn string_pattern(method: &str) -> String {
    format!(
        "Use `includes`, `startsWith`, `indexOf` or `===` for plain text, or pass a RegExp (`/…/` or `new RegExp(pattern)`) when the string is meant as a pattern. `{method}()` compiles a string argument as a regex, so `.`, `*`, `?`, `(` and the other metacharacters in it change what matches."
    )
}

fn unescaped_value(value: &str) -> String {
    format!(
        "Escape `{value}` with the project's escape helper (`escapeRegExp({value})`, or `RegExp.escape` on a runtime that has it), interpolate a RegExp's `.source` when the value is meant as a pattern, or compare plain text with `includes` or `startsWith`. Built into this regex unescaped, the metacharacters in it change the pattern."
    )
}

fn pattern_parts(node: Node) -> Vec<Node> {
    let target = unwrapped(node);
    match target.kind() {
        "TemplateLiteral" => target.nodes("expressions"),
        "TaggedTemplateExpression" => {
            let tag = target.node("tag").filter(|tag| tag.is("MemberExpression"));
            let raw = tag.is_some_and(|tag| {
                name_of(tag.node("object")).as_deref() == Some("String") && name_of(tag.node("property")).as_deref() == Some("raw")
            });
            match target.node("quasi") {
                Some(quasi) if raw => quasi.nodes("expressions"),
                _ => Vec::new(),
            }
        }
        "BinaryExpression" if target.text("operator").as_deref() == Some("+") => {
            let parts = operands_of(target, "+");
            if parts.iter().any(|part| string_value(Some(*part)).is_some()) {
                return parts.into_iter().filter(|part| string_value(Some(*part)).is_none()).collect();
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

struct State<'c, 'a, 's> {
    scope: &'c Scope<'c, 'a, 's>,
}

impl<'s> State<'_, '_, 's> {
    fn is_pattern_source(&self, node: Node<'s>) -> bool {
        if !node.is("MemberExpression") || node.flag("computed") || name_of(node.node("property")).as_deref() != Some("source") {
            return false;
        }
        let Some(object) = node.node("object") else { return false };
        self.answer(self.scope.types.borrow_mut().is_regexp_at(object.start(), object.end()))
    }

    fn answer(&self, found: Option<bool>) -> bool {
        found.unwrap_or_else(|| {
            self.scope.types.borrow_mut().refuse("no type for a pattern part");
            false
        })
    }

    fn is_runtime_value(&self, part: Node<'s>) -> bool {
        let target = unwrapped(part);
        if self.is_pattern_source(target) || string_value(Some(resolve_constant(self.scope.scopes, target))).is_some() {
            return false;
        }
        let runtime = self.scope.types.borrow_mut().is_runtime_string_at(target.start(), target.end());
        self.answer(runtime) && depends_on_input(self.scope.scopes, target)
    }

    fn is_string(&self, node: Node) -> bool {
        self.answer(self.scope.types.borrow_mut().is_string_at(node.start(), node.end()))
    }

    fn check_construction(&self, node: Node<'s>, found: &mut Vec<(u32, u32, String)>) {
        let is_regexp = node.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("RegExp"));
        let Some(pattern) = node.nodes("arguments").first().copied().filter(|_| is_regexp) else { return };
        let runtime = pattern_parts(pattern).into_iter().find(|part| self.is_runtime_value(*part));
        if let Some(part) = runtime {
            let value = &self.scope.text[unwrapped(part).start() as usize..unwrapped(part).end() as usize];
            found.push((part.start(), part.end(), unescaped_value(value)));
        }
    }

    fn check_string_argument(&self, node: Node<'s>, found: &mut Vec<(u32, u32, String)>) {
        let Some(callee) = node.node("callee").filter(|callee| callee.is("MemberExpression")) else { return };
        let method = callee_name_of(callee).filter(|method| PATTERN_METHODS.contains(&method.as_str()));
        let argument = node.nodes("arguments").first().copied().filter(|argument| !argument.is("SpreadElement"));
        let (Some(method), Some(argument), Some(object)) = (method, argument, callee.node("object")) else { return };
        if self.is_string(object) && self.is_string(argument) {
            found.push((argument.start(), argument.end(), string_pattern(&method)));
        }
    }
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let scope = Scope { scopes, types, text: context.file.text };
    let state = State { scope: &scope };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression") || node.is("NewExpression")) {
        state.check_construction(node, &mut found);
        if node.is("CallExpression") {
            state.check_string_argument(node, &mut found);
        }
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
