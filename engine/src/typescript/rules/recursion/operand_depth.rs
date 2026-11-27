//! `no-operand-depth-recursion`: a function that calls itself on both operands of its input with no depth limit, so
//! the call stack grows with the length of an operand chain.
use super::file_calls::{called_key, descendants, functions_of, is_callable, FileFunction};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::Context;

const RULE: &str = "no-operand-depth-recursion";
const OPERAND_PAIRS: [(&str, &str); 2] = [("left", "right"), ("lhs", "rhs")];
const DEPTH_WORDS: [&str; 5] = ["depth", "level", "limit", "remaining", "budget"];
const OPERAND_WORDS: [&str; 4] = ["operator", "binary", "infix", "operand"];

fn mentions(text: &str, words: &[&str]) -> bool {
    let lower = text.to_ascii_lowercase();
    words.iter().any(|word| lower.contains(word))
}

fn operand_of(argument: Node, params: &[&String]) -> Option<(String, String)> {
    let inner = if argument.is("TSAsExpression") || argument.is("TSNonNullExpression") { argument.node("expression")? } else { argument };
    if !inner.is("MemberExpression") || inner.flag("computed") {
        return None;
    }
    let root = inner.node("object").and_then(|object| object.name())?;
    let property = inner.node("property").and_then(|property| property.name())?;
    params.iter().any(|param| **param == root).then(|| (root.into_owned(), property.into_owned()))
}

fn shadowed(call: Node, function: &FileFunction) -> Vec<String> {
    call.ancestors()
        .take_while(|ancestor| *ancestor != function.node)
        .filter(|ancestor| is_callable(Some(*ancestor)))
        .flat_map(|ancestor| ancestor.nodes("params").into_iter().filter_map(|param| param.name().map(|name| name.into_owned())))
        .collect()
}

fn operand_calls<'v>(function: &FileFunction<'v>) -> Vec<((String, String), Node<'v>)> {
    let mut found: Vec<((String, String), Node)> = Vec::new();
    let Some(body) = function.node.node("body") else { return found };
    let calls = descendants(body).into_iter().filter(|node| node.is("CallExpression") && called_key(*node, &function.owner).as_deref() == Some(&function.key));
    for call in calls {
        let hidden = shadowed(call, function);
        let params: Vec<&String> = function.params.iter().filter(|name| !hidden.contains(name)).collect();
        for operand in call.nodes("arguments").into_iter().filter_map(|argument| operand_of(argument, &params)) {
            if !found.iter().any(|(known, _)| *known == operand) {
                found.push((operand, call));
            }
        }
    }
    found
}

fn compares_param(function: &FileFunction) -> bool {
    let Some(body) = function.node.node("body") else { return false };
    descendants(body).into_iter().any(|node| {
        node.is("BinaryExpression")
            && matches!(node.text("operator").as_deref(), Some("<" | "<=" | ">" | ">="))
            && [node.node("left"), node.node("right")].into_iter().flatten().any(|side| side.name().is_some_and(|name| function.params.iter().any(|param| *param == name)))
    })
}

fn chain_call<'v>(function: &FileFunction<'v>, text: &str) -> Option<Node<'v>> {
    if !mentions(text, &OPERAND_WORDS) || function.params.iter().any(|name| mentions(name, &DEPTH_WORDS)) || compares_param(function) {
        return None;
    }
    let calls = operand_calls(function);
    let call_of = |root: &str, property: &str| calls.iter().find(|((known_root, known), _)| known_root == root && known == property).map(|(_, call)| *call);
    OPERAND_PAIRS.iter().find_map(|(first, second)| {
        let root = function.params.iter().find(|root| call_of(root, first).is_some() && call_of(root, second).is_some())?;
        call_of(root, first)
    })
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let source = context.file.text;
    let mut found = Vec::new();
    for function in functions_of(view.program()) {
        let text = source.get(function.node.start() as usize..function.node.end() as usize).unwrap_or_default();
        if let Some(call) = chain_call(&function, text) {
            found.push((call.start(), call.end(), function.name.clone()));
        }
    }
    for (start, end, name) in found {
        let message = format!("'{name}' calls itself on both operands of its input expression, so the call stack grows with the length of an operand chain. Generated code (a string of thousands of `+` operands, a long `else if` ladder, a builder chain) nests far deeper than hand-written tests, and the walk ends in a stack overflow that no caller catches. Walk the left-leaning chain in a loop and recurse only into the right operand, use an explicit stack, or pass a depth and stop with an ordinary error past a limit.");
        context.report_range(RULE, start, Some(end), message);
    }
}
