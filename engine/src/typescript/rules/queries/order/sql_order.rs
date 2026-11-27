//! `shared/rules/queries/sql-order.mts`: the pages (`limit`, `offset`, `fetch first`) and `array_agg`/`json_agg`
//! lists of an SQL text that no `order by` fixes the order of, scope by parenthesised scope.
use regex::Regex;
use std::sync::LazyLock;

pub const DYNAMIC: char = '\u{0}';

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum GapKind {
    Page,
    Aggregate,
}

pub struct SqlGap {
    pub kind: GapKind,
    pub form: String,
    index: usize,
}

struct Scope {
    start: usize,
    name: String,
    text: String,
    opaque: bool,
    aggregates: Vec<SqlGap>,
    child_ordered: bool,
}

/// `\s` of a JavaScript `u` pattern.
const S: &str = r"[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]";
const B: &str = r"(?-u:\b)";
const AGGREGATES: [&str; 3] = ["array_agg", "json_agg", "jsonb_agg"];
const VALUE_WORDS: [&str; 25] = [
    "like", "ilike", "in", "between", "and", "or", "not", "is", "limit", "offset", "where", "on", "having", "when", "then", "else", "values", "any", "all", "first",
    "next", "by", "select", "set", "distinct",
];
const EXISTS: &str = "exists";

fn pattern(source: &str) -> Regex {
    Regex::new(&source.replace("{s}", S).replace("{b}", B).replace("{w}", "[0-9A-Za-z_]")).expect("pattern")
}

static MASKED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"--[^\n]*|/\*[\s\S]*?\*/|'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`"#).expect("pattern"));
static SELECT: LazyLock<Regex> = LazyLock::new(|| pattern("{b}select{b}"));
static ORDER_BY: LazyLock<Regex> = LazyLock::new(|| pattern("{b}order{s}+by{b}"));
static PAGE_CLAUSE: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?:limit|offset){s}+(?:[0-9]+|\x00|\?|:{w}+|\$[0-9]+|%s)"));
static FETCH_CLAUSE: LazyLock<Regex> = LazyLock::new(|| pattern("{b}fetch{s}+(?:first|next){b}"));
static FROM: LazyLock<Regex> = LazyLock::new(|| pattern("{b}from{b}"));
static SINGLE_ROW: LazyLock<Regex> = LazyLock::new(|| pattern("{b}limit{s}+1{b}|{b}fetch{s}+(?:first|next){s}+(?:1{s}+)?rows?{b}"));
static SELECT_START: LazyLock<Regex> = LazyLock::new(|| pattern("{b}select{s}"));
static MODIFIER: LazyLock<Regex> = LazyLock::new(|| pattern("^{s}*(?:all|distinct){s}"));
static SELECTION_END: LazyLock<Regex> = LazyLock::new(|| pattern("{b}(?:from|limit|fetch){b}"));
static CONSTANT_ITEM: LazyLock<Regex> = LazyLock::new(|| {
    pattern(r"^(?:[0-9]+|true|false|null|''|(?:count|exists|max|min|sum|avg){s}*\(\)|\x00)(?:{s}+(?:as{s}+)?[0-9A-Za-z_$]+)?$")
});
static VALUE_BEFORE: LazyLock<Regex> =
    LazyLock::new(|| pattern(&format!(r"(?:[=<>!+\-*/%,(|]|{{b}}(?:{})){{s}}*$", VALUE_WORDS.join("|"))));
static FUNCTION_NAME: LazyLock<Regex> = LazyLock::new(|| pattern(r"([0-9A-Za-z_$]+){s}*$"));
static SPACES: LazyLock<Regex> = LazyLock::new(|| pattern("{s}+"));

fn is_js_space(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn masked(text: &str) -> String {
    MASKED.replace_all(text, |found: &regex::Captures| if found[0].starts_with('\'') { "''" } else { "q" }).to_lowercase()
}

/// `PAGE_CLAUSE.exec`: `limit`/`offset` with a value, not after `[\w$:.]`, or `fetch first|next`, whichever is first.
fn page_clause(text: &str) -> Option<&str> {
    let mut at = 0;
    let mut paged = None;
    while let Some(found) = PAGE_CLAUSE.find_at(text, at) {
        let before = text[..found.start()].chars().next_back();
        if !before.is_some_and(|before| before.is_ascii_alphanumeric() || matches!(before, '_' | '$' | ':' | '.')) {
            paged = Some(found);
            break;
        }
        at = found.start() + text[found.start()..].chars().next().map_or(1, char::len_utf8);
    }
    let fetched = FETCH_CLAUSE.find(text);
    let first = match (paged, fetched) {
        (Some(paged), Some(fetched)) => if fetched.start() < paged.start() { fetched } else { paged },
        (found, None) | (None, found) => found?,
    };
    Some(first.as_str())
}

fn new_scope(start: usize, name: String) -> Scope {
    Scope { start, name, text: String::new(), opaque: false, aggregates: Vec::new(), child_ordered: false }
}

fn is_ordered_select(scope: &Scope) -> bool {
    SELECT.is_match(&scope.text) && ORDER_BY.is_match(&scope.text)
}

fn selection_of(text: &str) -> Option<&str> {
    let start = SELECT_START.find(text)?;
    let rest = &text[start.end()..];
    let rest = match MODIFIER.find(rest) {
        Some(modifier) => &rest[modifier.end()..],
        None => rest,
    };
    Some(match SELECTION_END.find(rest) {
        Some(end) => &rest[..end.start()],
        None => rest,
    })
}

fn is_constant_selection(text: &str) -> bool {
    let items: Vec<&str> = selection_of(text).map(|selection| selection.split(',').map(|item| item.trim_matches(is_js_space)).collect()).unwrap_or_default();
    !items.is_empty() && items.iter().all(|item| CONSTANT_ITEM.is_match(item))
}

fn is_unordered_select(scope: &Scope) -> bool {
    let text = &scope.text;
    !scope.opaque && scope.name != EXISTS && SELECT.is_match(text) && FROM.is_match(text) && !ORDER_BY.is_match(text)
}

fn page_gap(scope: &Scope) -> Option<SqlGap> {
    let clause = page_clause(&scope.text)?;
    if !is_unordered_select(scope) || (SINGLE_ROW.is_match(&scope.text) && is_constant_selection(&scope.text)) {
        return None;
    }
    let form = SPACES.replace_all(&clause.replace(DYNAMIC, "?"), " ").to_uppercase();
    Some(SqlGap { kind: GapKind::Page, form, index: scope.start })
}

fn close_scope(mut scope: Scope, parent: Option<&mut Scope>, gaps: &mut Vec<SqlGap>) {
    gaps.extend(page_gap(&scope));
    let aggregates = std::mem::take(&mut scope.aggregates);
    if !(scope.child_ordered || scope.opaque) {
        gaps.extend(aggregates);
    }
    let Some(parent) = parent else { return };
    parent.text.push_str("()");
    parent.opaque = parent.opaque || (scope.opaque && !SELECT.is_match(&scope.text));
    parent.child_ordered = parent.child_ordered || is_ordered_select(&scope);
    if AGGREGATES.contains(&scope.name.as_str()) && !scope.opaque && !ORDER_BY.is_match(&scope.text) {
        parent.aggregates.push(SqlGap { kind: GapKind::Aggregate, form: format!("{}(...)", scope.name), index: scope.start });
    }
}

fn top(stack: &mut [Scope]) -> &mut Scope {
    stack.last_mut().expect("the scope stack holds the statement")
}

fn add_dynamic(scope: &mut Scope, nested: bool) {
    let value = VALUE_BEFORE.is_match(&scope.text) || (nested && scope.text.trim_matches(is_js_space).is_empty());
    scope.opaque = scope.opaque || !value;
    scope.text.push(DYNAMIC);
}

/// `sqlOrderGaps`: the unordered pages and aggregate lists of an SQL text, in the order their scopes open.
pub fn sql_order_gaps(text: &str) -> Vec<SqlGap> {
    let source = masked(text);
    let mut stack = vec![new_scope(0, String::new())];
    let mut gaps = Vec::new();
    for (index, character) in source.chars().enumerate() {
        if character == '(' {
            let name = FUNCTION_NAME.captures(&top(&mut stack).text).map(|found| found[1].to_string()).unwrap_or_default();
            stack.push(new_scope(index, name));
        } else if character == ')' && stack.len() > 1 {
            let scope = stack.pop().expect("a nested scope");
            close_scope(scope, stack.last_mut(), &mut gaps);
        } else if character == DYNAMIC {
            let nested = stack.len() > 1;
            add_dynamic(top(&mut stack), nested);
        } else {
            top(&mut stack).text.push(character);
        }
    }
    while let Some(scope) = stack.pop() {
        close_scope(scope, stack.last_mut(), &mut gaps);
    }
    gaps.sort_by_key(|gap| gap.index);
    gaps
}
