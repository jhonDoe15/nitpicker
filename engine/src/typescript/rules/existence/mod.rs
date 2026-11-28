//! `no-directory-passing-existence-check`: a file read guarded only by an existence check, which a directory of
//! that name passes too.
mod files;

use self::files::{existence_checked_path, is_configured_path, name_of, read_call_path, unwrap_of};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_runtime::production_runtime::first_token;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

const RULE: &str = "no-directory-passing-existence-check";
const MESSAGE: &str = "An existence check is true for a directory, so this read throws EISDIR when a folder has the expected name. Check `statSync(path, { throwIfNoEntry: false })?.isFile()` instead, or read inside a `try` that handles `ENOENT` and `EISDIR`.";
const CHAIN_READERS: [&str; 3] = ["map", "flatMap", "forEach"];
const EXITS: [&str; 4] = ["ReturnStatement", "ThrowStatement", "ContinueStatement", "BreakStatement"];
const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

static KIND_CHECKS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?-u:\b)(?:statSync|lstatSync|stat|lstat|isFile|isDirectory)(?-u:\b)").expect("kind checks"));
static BARE_PROBE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:existsSync|pathExistsSync)$").expect("probe"));
static CALLED_PROBE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:fs\.)?(?:existsSync|pathExistsSync)\([0-9A-Za-z_]+\)$").expect("probe call"));

struct Check<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    text: &'a str,
    reported: HashSet<u32>,
    found: Vec<Node<'s>>,
}

fn is_function(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

fn exits(node: Node) -> bool {
    if node.is("BlockStatement") { node.nodes("body").iter().any(|statement| EXITS.contains(&statement.kind())) } else { EXITS.contains(&node.kind()) }
}

fn is_handled(read: Node) -> bool {
    read.ancestors().any(|ancestor| {
        let block = ancestor.node("block").filter(|_| ancestor.is("TryStatement") && ancestor.node("handler").is_some());
        block.is_some_and(|block| block.start() <= read.start() && read.end() <= block.end())
    })
}

fn method_name(node: Option<Node>) -> String {
    node.filter(|node| node.is("MemberExpression")).and_then(|node| name_of(node.node("property"))).unwrap_or_default()
}

fn filtered_callback(call: Node) -> Option<Node> {
    let callee = call.node("callee");
    let source = callee.filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object"));
    let source = source.filter(|source| source.is("CallExpression") && CHAIN_READERS.contains(&method_name(callee).as_str()))?;
    (method_name(source.node("callee")) == "filter").then(|| source.list("arguments").first().copied().flatten()).flatten()
}

fn statements_after(node: Node) -> Vec<Node> {
    let Some(holder) = node.parent().filter(|holder| holder.is("BlockStatement") || holder.is("Program")) else { return Vec::new() };
    let body = holder.nodes("body");
    let from = body.iter().position(|item| *item == node).map_or(0, |at| at + 1);
    body[from..].to_vec()
}

fn operands_of<'v>(root: Node<'v>, operator: &str) -> Vec<Node<'v>> {
    let mut pending = vec![root];
    let mut operands = Vec::new();
    let mut at = 0;
    while at < pending.len() {
        let node = pending[at];
        at += 1;
        let join = matches!(node.kind(), "LogicalExpression" | "BinaryExpression") && node.text("operator").as_deref() == Some(operator);
        if join {
            pending.extend(node.node("left"));
            pending.extend(node.node("right"));
        } else {
            operands.push(node);
        }
    }
    operands
}

impl<'s> Check<'_, '_, 's> {
    fn source(&self, node: Node) -> &str {
        if node.is("Program") {
            return &self.text[first_token(self.text)..];
        }
        &self.text[node.start() as usize..node.end() as usize]
    }

    fn reads_of(&self, root: Node<'s>, text: &str) -> Vec<Node<'s>> {
        let paths = root.descendants().into_iter().filter(|node| node.is("CallExpression"));
        paths.filter(|call| read_call_path(*call).is_some_and(|path| self.source(path) == text)).collect()
    }

    fn report_reads(&mut self, guarded: Node<'s>, path: Node<'s>, region: &[Node<'s>]) {
        let scope = guarded.ancestors().find(|ancestor| is_function(*ancestor)).unwrap_or_else(|| guarded.view.program());
        if KIND_CHECKS.is_match(self.source(scope)) || !is_configured_path(self.scopes, path) {
            return;
        }
        let text = self.source(path).to_string();
        let reads: Vec<Node> = region.iter().flat_map(|part| self.reads_of(*part, &text)).collect();
        for read in reads {
            if !is_handled(read) && self.reported.insert(read.index) {
                self.found.push(read);
            }
        }
    }

    fn check_operands(&mut self, test: Node<'s>, region: &[Node<'s>]) {
        for part in operands_of(unwrap_of(test, &["TSNonNullExpression"]), "&&") {
            if let Some(path) = existence_checked_path(part) {
                self.report_reads(part, path, region);
            }
        }
    }

    fn filter_guard(&mut self, call: Node<'s>) {
        let Some(filter) = filtered_callback(call) else { return };
        let Some(reader) = call.list("arguments").first().copied().flatten().filter(|reader| matches!(reader.kind(), "ArrowFunctionExpression" | "FunctionExpression")) else { return };
        let probe = if filter.is("Identifier") {
            name_of(Some(filter)).unwrap_or_default()
        } else if is_function(filter) && filter.node("body").is_some_and(|body| !body.is("BlockStatement")) {
            filter.node("body").map(|body| self.source(body).to_string()).unwrap_or_default()
        } else {
            String::new()
        };
        let guarded = BARE_PROBE.is_match(&probe) || CALLED_PROBE.is_match(&probe);
        let parameter = reader.list("params").first().copied().flatten().filter(|parameter| parameter.is("Identifier"));
        if let (true, Some(parameter), Some(body)) = (guarded, parameter, reader.node("body")) {
            self.report_reads(call, parameter, &[body]);
        }
    }

    fn visit(&mut self, node: Node<'s>) {
        match node.kind() {
            "IfStatement" => {
                let (Some(test), Some(consequent)) = (node.node("test"), node.node("consequent")) else { return };
                self.check_operands(test, &[consequent]);
                let negated = test.node("argument").filter(|_| test.is("UnaryExpression") && test.text("operator").as_deref() == Some("!"));
                if let Some(path) = negated.and_then(existence_checked_path).filter(|_| exits(consequent)) {
                    self.report_reads(test, path, &statements_after(node));
                }
            }
            "ConditionalExpression" => {
                if let (Some(test), Some(consequent)) = (node.node("test"), node.node("consequent")) {
                    self.check_operands(test, &[consequent]);
                }
            }
            "LogicalExpression" if node.text("operator").as_deref() == Some("&&") => {
                if let (Some(left), Some(right)) = (node.node("left"), node.node("right")) {
                    self.check_operands(left, &[right]);
                }
            }
            "ExpressionStatement" => {
                let awaited = node.node("expression").filter(|expression| expression.is("AwaitExpression"));
                if let Some(path) = awaited.and_then(existence_checked_path) {
                    self.report_reads(node, path, &statements_after(node));
                }
            }
            "CallExpression" => self.filter_guard(node),
            _ => {}
        }
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut state = Check { scopes, text: context.file.text, reported: HashSet::new(), found: Vec::new() };
    for node in view.nodes() {
        state.visit(node);
    }
    for read in state.found {
        context.report_range(RULE, read.start(), Some(read.end()), MESSAGE.to_string());
    }
}
