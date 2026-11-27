//! `no-copy-pasted-tests`: three or more plain cases in one body whose callbacks have the same tokens once literals
//! are written as their token type, the way `sourceCode.getTokens` of typescript-estree types them.
use super::runner_words::runner_word;
use super::test_calls::{callback_of, chain_has_property, is_case_call};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, View};
use crate::typescript::with_tokens;
use oxc_parser::Kind;
use std::collections::HashSet;

const RULE: &str = "no-copy-pasted-tests";
const MIN_COPIES: usize = 3;

/// A plain case of a body: the call and its callback.
type Case<'v> = (Node<'v>, Node<'v>);

fn plain_case(statement: Node) -> Option<Case> {
    let call = statement.node("expression").filter(|_| statement.is("ExpressionStatement"))?;
    let each = call.node("callee").is_some_and(|callee| chain_has_property(callee, "each"));
    if !is_case_call(call) || each {
        return None;
    }
    Some((call, callback_of(call)?))
}

fn bodies(view: &View) -> Vec<Vec<Case<'_>>> {
    view.nodes()
        .filter(|node| node.is("Program") || node.is("BlockStatement"))
        .map(|body| body.nodes("body").into_iter().filter_map(plain_case).collect::<Vec<_>>())
        .filter(|cases| cases.len() >= MIN_COPIES)
        .collect()
}

/// Starts of the tokens typescript-estree types as literals: the values of `Literal` nodes other than JSX attribute
/// values, and `null` as a type.
fn literal_starts(view: &View) -> HashSet<u32> {
    view.nodes()
        .filter(|node| {
            (node.is("Literal") && !node.parent().is_some_and(|parent| parent.is("JSXAttribute"))) || node.is("TSNullKeyword")
        })
        .map(|node| node.start())
        .collect()
}

fn token_type(kind: Kind) -> Option<&'static str> {
    match kind {
        Kind::Str => Some("String"),
        Kind::True | Kind::False => Some("Boolean"),
        Kind::Null => Some("Null"),
        Kind::RegExp => Some("RegularExpression"),
        _ if kind.is_number() => Some("Numeric"),
        _ => None,
    }
}

fn is_template(kind: Kind) -> bool {
    matches!(kind, Kind::NoSubstitutionTemplate | Kind::TemplateHead | Kind::TemplateMiddle | Kind::TemplateTail)
}

/// typescript-estree drops the first `<` of a `<<` that the compiler splits to open type parameters (`f<<T>() => T>`).
fn dropped_less_than(kind: Kind, next: Option<(Kind, u32)>, end: u32) -> bool {
    kind == Kind::LAngle && next.is_some_and(|(next, start)| next == Kind::LAngle && start == end)
}

/// `shapeOf`: the tokens of the range joined by spaces, each literal written as `<type>`.
fn shapes(context: &Context, ranges: &[(u32, u32)], literals: &HashSet<u32>) -> Vec<String> {
    with_tokens(context.file.path, context.file.text, |file| {
        let tokens = file.tokens;
        ranges
            .iter()
            .map(|&(start, end)| {
                let first = tokens.partition_point(|token| token.start() < start);
                let mut words: Vec<String> = Vec::new();
                let within: Vec<_> = tokens[first..].iter().take_while(|token| token.end() <= end).collect();
                for (index, token) in within.iter().enumerate() {
                    let kind = token.kind();
                    if dropped_less_than(kind, within.get(index + 1).map(|next| (next.kind(), next.start())), token.end()) {
                        continue;
                    }
                    let typed = if is_template(kind) { Some("Template") } else { token_type(kind).filter(|_| literals.contains(&token.start())) };
                    words.push(typed.map_or_else(|| file.slice(token.start(), token.end()).to_string(), |name| format!("<{name}>")));
                }
                words.join(" ")
            })
            .collect()
    })
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let found = bodies(view);
    if found.is_empty() {
        return;
    }
    let literals = literal_starts(view);
    let ranges: Vec<(u32, u32)> = found.iter().flatten().map(|(_, callback)| (callback.start(), callback.end())).collect();
    let mut keys = shapes(context, &ranges, &literals).into_iter();
    let each_case = runner_word(context, RULE, "each-case").to_string();
    let mut reports = Vec::new();
    for cases in &found {
        let mut groups: Vec<(String, Vec<Node>)> = Vec::new();
        for (call, _) in cases {
            let key = keys.next().unwrap_or_default();
            match groups.iter_mut().find(|(known, _)| *known == key) {
                Some((_, calls)) => calls.push(*call),
                None => groups.push((key, vec![*call])),
            }
        }
        for (_, calls) in groups.iter().filter(|(_, calls)| calls.len() >= MIN_COPIES) {
            let message = format!(
                "This test repeats the body of {} others and differs only in its literals. Put the cases in one table and {each_case}.",
                calls.len() - 1
            );
            for callee in calls[MIN_COPIES - 1..].iter().filter_map(|call| call.node("callee")) {
                reports.push((callee.start(), callee.end(), message.clone()));
            }
        }
    }
    for (start, end, message) in reports {
        context.report_range(RULE, start, Some(end), message);
    }
}
