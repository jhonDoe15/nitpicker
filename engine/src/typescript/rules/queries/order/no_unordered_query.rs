//! `no-unordered-query`: a page of rows (`limit`, `offset`, `take`, `skip` or a cursor) or an
//! `array_agg`/`json_agg` list with no `order by`, in a query builder chain, find options or SQL text.
use super::options::unordered_option_pages;
use super::sql_order::GapKind;
use super::texts::sql_gaps;
use crate::typescript::rules::Context;
use crate::typescript::rules::database::modules::ModuleScope;
use crate::typescript::rules::queries::chains::{Step, chain_steps, is_opaque, is_ordered, is_outermost_step, is_write, query_chain, step_names};
use crate::typescript::rules::queries::libraries::{Library, QueryScope};
use crate::typescript::rules::security_values::{member_name, string_value, unwrapped};
use crate::typescript::rules::support::view::{Node, Value};
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-unordered-query";
const PAGE_STEPS: [&str; 4] = ["limit", "offset", "take", "skip"];
const SELECTION_STEPS: [&str; 4] = ["select", "selectAll", "addSelect", "columns"];
const COUNT_STEPS: [&str; 3] = ["count", "countAll", "countDistinct"];
const SINGLE_ROW_STEPS: [&str; 2] = ["limit", "take"];
const AGGREGATE_NAMES: [&str; 3] = ["array_agg", "json_agg", "jsonb_agg"];
const FORM_LENGTH: usize = 40;
const EXCEPTION: &str = "An exception fits only a query whose rows are known to come back in one order anyway, such as a primary-key lookup.";
const AGGREGATE_EXCEPTION: &str =
    "An exception fits only a nested list that is a set, whose callers never depend on its order; add the path to \"exceptions\" with that reason.";

static CONSTANT_SELECTION: LazyLock<Regex> = LazyLock::new(|| {
    let s = r"[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]";
    let b = r"(?-u:\b)";
    let source = format!(
        r#"{b}(?:count(?:All|Distinct)?|max|min|sum|avg){s}*\(|\.lit{s}*\(|{b}exists{s}*\(|{b}sql(?:<[^>]*>)?{s}*`{s}*1{s}*`|^['"`]{s}*1{s}*(?:as{s}+[0-9A-Za-z_]+)?['"`]$"#
    );
    Regex::new(&source).expect("pattern")
});

#[derive(Clone, Copy, PartialEq)]
enum Message {
    Page,
    Aggregate,
}

struct Tracker<'c, 'a, 's> {
    scope: QueryScope<'c, 'a, 's>,
    reported: Vec<(u32, u32, Message, String)>,
}

fn named(step: &Step, names: &[&str]) -> bool {
    step.name.as_deref().is_some_and(|name| names.contains(&name))
}

fn utf16_length(text: &str) -> usize {
    text.encode_utf16().count()
}

impl Tracker<'_, '_, '_> {
    fn source(&self, node: Node) -> &str {
        self.scope.module.source(node)
    }

    fn step_form(&self, step: &Step) -> String {
        let name = step.name.clone().unwrap_or_else(|| "undefined".to_string());
        let arguments: Vec<&str> = step.call.nodes("arguments").into_iter().map(|argument| self.source(argument)).collect();
        let text = format!("{name}({})", arguments.join(", "));
        if utf16_length(&text) > FORM_LENGTH || text.contains('\n') { format!("{name}(...)") } else { text }
    }

    fn report(&mut self, node: Node, message: Message, form: String) {
        let key = (node.start(), node.end(), message, form);
        if !self.reported.contains(&key) {
            self.reported.push(key);
        }
    }

    fn report_step(&mut self, step: &Step, message: Message) {
        let callee = step.call.node("callee").filter(|callee| callee.is("MemberExpression"));
        if let Some(property) = callee.and_then(|callee| callee.node("property")) {
            let form = self.step_form(step);
            self.report(property, message, form);
        }
    }

    fn is_constant_selection(&self, steps: &[Step]) -> bool {
        let selections: Vec<&Step> = steps.iter().filter(|step| named(step, &SELECTION_STEPS) || named(step, &COUNT_STEPS)).collect();
        !selections.is_empty()
            && selections.iter().all(|step| {
                let arguments = step.call.nodes("arguments");
                named(step, &COUNT_STEPS)
                    || (!arguments.is_empty() && arguments.iter().all(|argument| CONSTANT_SELECTION.is_match(self.source(*argument))))
            })
    }
}

fn is_single_row(steps: &[Step]) -> bool {
    let pages: Vec<&Step> = steps.iter().filter(|step| named(step, &PAGE_STEPS)).collect();
    let Some(first) = pages.first() else { return false };
    let value = if pages.len() == 1 { first.call.nodes("arguments").first().copied().map(unwrapped) } else { None };
    named(first, &SINGLE_ROW_STEPS) && value.is_some_and(|value| value.is("Literal") && value.get("value") == Value::Number(1.0))
}

fn inside_exists(node: Node) -> bool {
    let Some(call) = node.parent().filter(|call| call.is("CallExpression") && call.nodes("arguments").contains(&node)) else { return false };
    let Some(callee) = call.node("callee").map(unwrapped) else { return false };
    let name = if callee.is("MemberExpression") { member_name(callee) } else { callee.name().map(|name| name.into_owned()) };
    matches!(name.as_deref(), Some("exists" | "notExists"))
}

fn is_aggregate_step(step: &Step) -> bool {
    let first = string_value(step.call.nodes("arguments").first().copied().map(unwrapped));
    step.name.as_deref() == Some("jsonAgg") || (step.name.as_deref() == Some("agg") && first.is_some_and(|first| AGGREGATE_NAMES.contains(&first.as_str())))
}

fn unordered_aggregate_step<'v, 's>(steps: &'v [Step<'s>]) -> Option<&'v Step<'s>> {
    let index = steps.iter().position(is_aggregate_step)?;
    let ordered = steps[index + 1..].iter().any(|step| step.name.as_deref() == Some("orderBy"));
    if ordered { None } else { steps.get(index) }
}

fn is_json_array_from(scope: &ModuleScope, call: Node) -> bool {
    let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("Identifier"));
    let binding = callee.and_then(|callee| callee.name()).and_then(|name| scope.binding(&name));
    binding.is_some_and(|binding| binding.source.starts_with("kysely/helpers/") && binding.imported.as_deref() == Some("jsonArrayFrom"))
}

fn unordered_subquery(argument: Option<Node>) -> bool {
    let Some(argument) = argument else { return false };
    let names = step_names(chain_steps(argument).steps.iter());
    names.iter().any(|name| name.as_deref() == Some("selectFrom")) && !is_ordered(&names) && !is_opaque(&names)
}

fn check_chain<'s>(tracker: &mut Tracker<'_, '_, 's>, node: Node<'s>) {
    let chain = if inside_exists(node) { None } else { query_chain(&tracker.scope, node) };
    if let Some(chain) = chain.filter(|chain| !(is_write(&chain.names) || is_opaque(&chain.names) || is_ordered(&chain.names))) {
        let page = chain.steps.iter().find(|step| named(step, &PAGE_STEPS));
        let existence = is_single_row(&chain.steps) && tracker.is_constant_selection(&chain.steps);
        if let Some(page) = page.filter(|_| !existence) {
            tracker.report_step(page, Message::Page);
        }
    }
    if tracker.scope.has(Library::Kysely) {
        let steps = chain_steps(node).steps;
        if let Some(aggregate) = unordered_aggregate_step(&steps) {
            tracker.report_step(aggregate, Message::Aggregate);
        }
    }
}

fn check_call<'s>(tracker: &mut Tracker<'_, '_, 's>, node: Node<'s>) {
    if is_json_array_from(&tracker.scope.module, node) && unordered_subquery(node.nodes("arguments").first().copied()) {
        tracker.report(node, Message::Aggregate, "jsonArrayFrom(...)".to_string());
    }
    for page in unordered_option_pages(&tracker.scope, node) {
        let form = String::from_utf16_lossy(&tracker.source(page).encode_utf16().take(FORM_LENGTH).collect::<Vec<u16>>());
        tracker.report(page, Message::Page, form);
    }
    if node.node("callee").is_some_and(|callee| callee.is("MemberExpression")) && is_outermost_step(node) {
        check_chain(tracker, node);
    }
}

fn check_text<'s>(tracker: &mut Tracker<'_, '_, 's>, node: Node<'s>) {
    for gap in sql_gaps(tracker.scope.module.scopes, node) {
        let message = if gap.kind == GapKind::Aggregate { Message::Aggregate } else { Message::Page };
        tracker.report(node, message, gap.form);
    }
}

fn message(message: Message, form: &str) -> String {
    match message {
        Message::Page => format!(
            "{form} picks a page of rows that has no ORDER BY, so which rows come back, and in which order, is up to the database and can change between runs. Order on a unique key before the page, or add a tie-breaker after a non-unique key: .orderBy('createdAt', 'desc').orderBy('id'). {EXCEPTION}"
        ),
        Message::Aggregate => format!(
            "{form} builds a list with no ORDER BY, so its elements come back in whatever order the database reads them, and a test that compares the whole list can fail at random. Order inside the aggregate (json_agg(t ORDER BY t.name), eb.fn.jsonAgg('t').orderBy('t.name')) or give jsonArrayFrom a subquery with orderBy. {AGGREGATE_EXCEPTION}"
        ),
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let module = ModuleScope::of(view, scopes, context.file.text);
    let mut tracker = Tracker { scope: QueryScope::of(module), reported: Vec::new() };
    for node in view.nodes() {
        match node.kind() {
            "CallExpression" => check_call(&mut tracker, node),
            "Literal" | "TemplateLiteral" | "TaggedTemplateExpression" => check_text(&mut tracker, node),
            _ => {}
        }
    }
    for (start, end, kind, form) in tracker.reported {
        context.report_range(RULE, start, Some(end), message(kind, &form));
    }
}
