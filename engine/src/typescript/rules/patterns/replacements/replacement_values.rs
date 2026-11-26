//! `replacement-values.mts`: whether a replacement string can hold a `$` that `replace` would expand.
use crate::typescript::rules::patterns::syntax::{callee_name_of, operands_of, resolve_constant, string_value, unwrapped};
use crate::typescript::rules::signatures::Scope;
use crate::typescript::rules::support::view::{Node, Value};
use regex::Regex;
use std::sync::LazyLock;

const MAX_DEPTH: usize = 4;
const TEXT_METHODS: [&str; 4] = ["toString", "toFixed", "toPrecision", "toLocaleString"];

static ESCAPE_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)escape|quote").expect("pattern"));

struct Plan<'v> {
    settled: bool,
    needs: Option<Vec<Node<'v>>>,
}

struct Record {
    settled: bool,
    needs_all: bool,
    children: Vec<usize>,
}

fn has_dollar(node: Node) -> bool {
    node.nodes("quasis").iter().any(|quasi| match quasi.get("value") {
        Value::Node(index) => {
            quasi.view.at(index).text("cooked").is_some_and(|cooked| cooked.contains('$'))
        }
        _ => false,
    })
}

fn is_escaping_replace(call: Node) -> bool {
    let Some(callee) = call.node("callee") else { return false };
    if !matches!(callee_name_of(callee).as_deref(), Some("replace" | "replaceAll")) {
        return false;
    }
    let Some(pattern) = call.nodes("arguments").first().copied() else { return false };
    if string_value(Some(pattern)).is_some_and(|text| text.contains('$')) {
        return true;
    }
    let source = match pattern.get("regex") {
        Value::Node(index) => pattern.view.at(index).text("pattern"),
        _ => None,
    };
    pattern.is("Literal") && source.is_some_and(|source| source.contains("\\$"))
}

fn text_source(call: Node) -> Option<Node> {
    let callee = call.node("callee")?;
    if callee.is("MemberExpression") {
        let method = callee_name_of(callee)?;
        return if TEXT_METHODS.contains(&method.as_str()) { callee.node("object") } else { None };
    }
    let arguments = call.nodes("arguments");
    if callee.is("Identifier") && callee.name().as_deref() == Some("String") && arguments.len() == 1 {
        return arguments.first().copied();
    }
    None
}

fn structure_plan(target: Node) -> Plan {
    let unsafe_plan = Plan { settled: false, needs: None };
    match target.kind() {
        "TemplateLiteral" if has_dollar(target) => Plan { settled: true, needs: None },
        "TemplateLiteral" => Plan { settled: false, needs: Some(target.nodes("expressions")) },
        "BinaryExpression" => {
            let operands = operands_of(target, "+");
            if operands.iter().any(|operand| string_value(Some(*operand)).is_some_and(|text| text.contains('$'))) {
                return Plan { settled: true, needs: None };
            }
            if target.text("operator").as_deref() == Some("+") { Plan { settled: false, needs: Some(operands) } } else { unsafe_plan }
        }
        "ConditionalExpression" => Plan { settled: false, needs: Some(target.node("consequent").into_iter().chain(target.node("alternate")).collect()) },
        "CallExpression" => {
            let source = text_source(target);
            let escaping = callee_name_of(target.node("callee").unwrap_or(target)).is_some_and(|name| ESCAPE_NAME.is_match(&name));
            if is_escaping_replace(target) || escaping {
                return Plan { settled: true, needs: None };
            }
            source.map_or(unsafe_plan, |source| Plan { settled: false, needs: Some(vec![source]) })
        }
        _ => unsafe_plan,
    }
}

fn plan_for<'v>(scope: &Scope<'_, '_, 'v>, node: Node<'v>, depth: usize) -> Plan<'v> {
    let target = unwrapped(resolve_constant(scope.scopes, unwrapped(node)));
    if depth > MAX_DEPTH {
        return Plan { settled: false, needs: None };
    }
    if string_value(Some(target)).is_some() {
        return Plan { settled: true, needs: None };
    }
    let plain = scope.types.borrow_mut().is_plain_at(target.start(), target.end());
    match plain {
        Some(true) => Plan { settled: true, needs: None },
        Some(false) => structure_plan(target),
        None => {
            scope.types.borrow_mut().refuse("no type for a replacement part");
            Plan { settled: false, needs: None }
        }
    }
}

fn expand<'v>(scope: &Scope<'_, '_, 'v>, root: Node<'v>) -> Vec<Record> {
    let mut visits = vec![(root, 0)];
    let mut records = Vec::new();
    let mut index = 0;
    while index < visits.len() {
        let (node, depth) = visits[index];
        index += 1;
        let plan = plan_for(scope, node, depth);
        let first = visits.len();
        let needs = plan.needs.clone().unwrap_or_default();
        visits.extend(needs.iter().map(|child| (*child, depth + 1)));
        records.push(Record { settled: plan.settled, needs_all: plan.needs.is_some(), children: (first..first + needs.len()).collect() });
    }
    records
}

pub fn is_safe_replacement<'v>(scope: &Scope<'_, '_, 'v>, node: Node<'v>) -> bool {
    let records = expand(scope, node);
    let mut safe = vec![false; records.len()];
    for (index, record) in records.iter().enumerate().rev() {
        let children_safe = record.children.iter().all(|child| safe[*child]);
        safe[index] = record.settled || (record.needs_all && children_safe);
    }
    safe.first().copied().unwrap_or(false)
}
