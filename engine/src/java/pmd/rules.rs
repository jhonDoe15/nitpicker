//! Runs PMD XPath rules, read from a rule list, on the PMD-shaped tree of each file.
use super::tree::{PmdTree, Value};
use super::xpath::eval::{Focus, Machine};
use super::xpath::parse::{Expr, Parser};
use super::xpath::value::{Env, Item, Seq};
use crate::engine::source::SourceFile;
use crate::engine::{FileRule, Project, finding::Finding};
use crate::java::types::project::JavaProject;
use crate::java::types::scope::Resolver;
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::rc::Rc;
use std::sync::Mutex;

#[derive(serde::Deserialize, Clone)]
pub struct Written {
    pub name: String,
    #[serde(default)]
    pub xpath: String,
    /// The PMD class of a rule written in Java, run by its port in `super::coded` in place of a query.
    #[serde(default)]
    pub port: String,
    #[serde(default)]
    pub message: String,
    /// PMD's `violationSuppressXPath`: a finding is dropped when this query, run on its node, selects a node.
    #[serde(default)]
    pub suppress: String,
    /// Rule properties other than the query; the query reads them as variables.
    #[serde(default)]
    pub properties: BTreeMap<String, Property>,
    /// PMD's `include-pattern` and `exclude-pattern` of the ruleset the rule runs in: each must match a whole
    /// path. A file a pattern of `exclude` matches is skipped unless a pattern of `include` matches it too.
    #[serde(default)]
    pub include: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

struct Scope {
    include: Vec<regex::Regex>,
    exclude: Vec<regex::Regex>,
}

impl Scope {
    fn of(rule: &Written) -> Result<Scope, regex::Error> {
        let whole = |patterns: &[String]| patterns.iter().map(|pattern| regex::Regex::new(&format!("^(?:{pattern})$"))).collect::<Result<Vec<_>, _>>();
        Ok(Scope { include: whole(&rule.include)?, exclude: whole(&rule.exclude)? })
    }

    fn covers(&self, path: &str) -> bool {
        !self.exclude.iter().any(|pattern| pattern.is_match(path)) || self.include.iter().any(|pattern| pattern.is_match(path))
    }
}

#[derive(serde::Deserialize, Clone)]
pub struct Property {
    #[serde(rename = "type", default)]
    pub kind: String,
    pub value: String,
}

struct Compiled {
    name: String,
    message: String,
    port: Option<super::coded::Port>,
    values: BTreeMap<String, String>,
    query: Result<Expr, String>,
    suppress: Option<Result<Expr, String>>,
    properties: Env,
}

pub struct XPathRules {
    written: Vec<Written>,
    scopes: Vec<Scope>,
    /// Per rule: files it ran on, nanoseconds, findings, and the first trouble it met.
    totals: Mutex<BTreeMap<String, (usize, u128, usize, Option<String>)>>,
}

thread_local! {
    static COMPILED: RefCell<Option<Rc<Vec<Compiled>>>> = const { RefCell::new(None) };
}

impl XPathRules {
    /// The rules named by `NP_XPATH_RULES` (a JSON list of name, xpath and message), narrowed by `NP_XPATH_ONLY`.
    pub fn from_env() -> Option<XPathRules> {
        let path = std::env::var("NP_XPATH_RULES").ok()?;
        let text = std::fs::read_to_string(&path).unwrap_or_else(|problem| refuse(&format!("cannot read {path}: {problem}")));
        let mut written: Vec<Written> = serde_json::from_str(&text).unwrap_or_else(|problem| refuse(&format!("{path} is no rule list: {problem}")));
        if let Ok(only) = std::env::var("NP_XPATH_ONLY") {
            let only: Vec<&str> = only.split(',').collect();
            if let Some(unknown) = only.iter().find(|name| !written.iter().any(|rule| rule.name == **name)) {
                refuse(&format!("NP_XPATH_ONLY names {unknown}, which {path} does not list"));
            }
            written.retain(|rule| only.contains(&rule.name.as_str()));
        }
        for rule in written.iter().filter(|rule| !rule.port.is_empty()) {
            if super::coded::port(&rule.port).is_none() {
                refuse(&format!("rule {} names {}, which has no port", rule.name, rule.port));
            }
        }
        for rule in written.iter().filter(|rule| rule.port.is_empty()) {
            if let Err(problem) = Parser::parse(&rule.xpath, rule.properties.keys().cloned().collect()) {
                refuse(&format!("rule {} has a query that cannot be read: {problem}", rule.name));
            }
        }
        let scopes = written
            .iter()
            .map(|rule| Scope::of(rule).unwrap_or_else(|problem| refuse(&format!("rule {} has a path pattern that cannot be read: {problem}", rule.name))))
            .collect();
        Some(XPathRules { written, scopes, totals: Mutex::new(BTreeMap::new()) })
    }

    fn compiled(&self) -> Rc<Vec<Compiled>> {
        COMPILED.with(|slot| {
            slot.borrow_mut()
                .get_or_insert_with(|| {
                    Rc::new(
                        self.written
                            .iter()
                            .map(|rule| Compiled {
                                name: rule.name.clone(),
                                message: rule.message.clone(),
                                port: super::coded::port(&rule.port),
                                values: rule.properties.iter().map(|(name, property)| (name.clone(), property.value.clone())).collect(),
                                query: Parser::parse(&rule.xpath, rule.properties.keys().cloned().collect()).map(|(query, _)| query),
                                suppress: (!rule.suppress.trim().is_empty())
                                    .then(|| Parser::parse(&rule.suppress, Vec::new()).map(|(query, _)| query)),
                                properties: rule
                                    .properties
                                    .values()
                                    .enumerate()
                                    .map(|(slot, property)| {
                                        let value = match property.kind.as_str() {
                                            "Boolean" => Item::Flag(property.value.trim() == "true"),
                                            "Integer" | "Long" => Item::Whole(property.value.trim().parse().unwrap_or(0)),
                                            // A list is a sequence of its entries, written with commas between them.
                                            kind if kind.starts_with("List[") => {
                                                let entries = property.value.split(',').map(str::trim).filter(|entry| !entry.is_empty());
                                                return (slot as u32, super::xpath::value::Bound::Now(Seq::from(entries.map(Item::text).collect())));
                                            }
                                            _ => Item::text(&property.value),
                                        };
                                        (slot as u32, super::xpath::value::Bound::Now(Seq::One(value)))
                                    })
                                    .collect(),
                            })
                            .collect(),
                    )
                })
                .clone()
        })
    }
}

impl Drop for XPathRules {
    fn drop(&mut self) {
        let Ok(path) = std::env::var("NP_XPATH_STATS") else { return };
        eprintln!("types and calls for rules: {} ms (all threads)", super::xpath::library::TYPE_NANOS.load(std::sync::atomic::Ordering::Relaxed) / 1_000_000);
        let totals = self.totals.lock().map(|totals| totals.clone()).unwrap_or_default();
        let rows: Vec<serde_json::Value> = totals
            .iter()
            .map(|(name, (files, nanos, findings, trouble))| {
                serde_json::json!({"rule": name, "files": files, "ms": *nanos as f64 / 1e6, "findings": findings, "trouble": trouble})
            })
            .collect();
        let _ = std::fs::write(path, serde_json::to_string_pretty(&rows).unwrap_or_default());
    }
}

impl FileRule for XPathRules {
    fn id(&self) -> &'static str {
        "_XPath"
    }
    fn needs_project(&self) -> bool {
        true
    }
    fn check(&self, _file: &SourceFile, _out: &mut Vec<Finding>) {}
    fn check_in(&self, file: &SourceFile, project: &Project, out: &mut Vec<Finding>) {
        let Some(project) = project.downcast_ref::<JavaProject>() else { return };
        let _parents = crate::engine::source::ParentTable::of(file.tree.root_node());
        let scope = &crate::java::types::scope::FileScope::of(file);
        let resolver = Resolver::new(&project.index, file, scope);
        let tree = PmdTree::build(file, file.tree.root_node(), &resolver);
        if tree.nodes.is_empty() {
            return;
        }
        let quiet = super::suppress::Suppressions::of(file);
        let machine = Machine::new(&tree, file, &resolver);
        let root = Item::Node(0);
        let mut local: Vec<(usize, u128, usize, Option<String>)> = Vec::new();
        let rules = self.compiled();
        let usages = std::cell::OnceCell::new();
        for (rule, scope) in rules.iter().zip(&self.scopes) {
            if !scope.covers(&file.path) {
                local.push((0, 0, 0, None));
                continue;
            }
            let started = std::time::Instant::now();
            let mut found = 0;
            if let Some(port) = rule.port {
                let ctx = super::coded::ctx::Ctx { tree: &tree, file, machine: &machine, properties: &rule.values, usages: &usages };
                let mut hits = Vec::new();
                port(&ctx, &mut hits);
                for hit in hits {
                    let place = |key: &str| ctx.whole(hit.node, key).unwrap_or(0) as usize;
                    if !quiet.idle() && quiet.hides(&tree, file, &resolver, hit.node, place("BeginLine"), &rule.name) {
                        continue;
                    }
                    if let Some(Ok(suppress)) = &rule.suppress {
                        let item = Item::Node(hit.node);
                        let selected = machine.eval(suppress, &Focus { item: Some(&item), position: 1, size: 1 }, &mut Env::default());
                        let failed = machine.trouble.borrow_mut().take().is_some();
                        if !failed && selected.items().iter().any(|selected| matches!(selected, Item::Node(_))) {
                            continue;
                        }
                    }
                    let message = super::coded::expanded(&ctx, super::coded::formatted(&rule.message, &hit.args), hit.node);
                    out.push(Finding { file: file.path.clone(), line: place("BeginLine"), column: place("BeginColumn"), rule: rule.name.clone(), message, symbol: None, priority: None });
                    found += 1;
                }
                local.push((1, started.elapsed().as_nanos(), found, None));
                continue;
            }
            let mut trouble = None;
            match &rule.query {
                Err(problem) => trouble = Some(format!("not parsed: {problem}")),
                Ok(query) => {
                    let mut env: Env = rule.properties.clone();
                    let result = machine.eval(query, &Focus { item: Some(&root), position: 1, size: 1 }, &mut env);
                    trouble = machine.trouble.borrow_mut().take();
                    if let Some(trouble) = &trouble {
                        // PMD reports no findings of a rule for a file on which the query fails.
                        out.push(Finding { file: file.path.clone(), line: 0, column: 0, rule: format!("!{}", rule.name), message: trouble.clone(), symbol: None, priority: None });
                    }
                    for item in result.items().iter().filter(|_| trouble.is_none()) {
                        let Item::Node(id) = item else { continue };
                        let place = |key: &str| match tree.attribute(file, *id, key) {
                            Some(Value::Whole(whole)) => whole as usize,
                            _ => 0,
                        };
                        if !quiet.idle() && quiet.hides(&tree, file, &resolver, *id, place("BeginLine"), &rule.name) {
                            continue;
                        }
                        if let Some(Ok(suppress)) = &rule.suppress {
                            let selected = machine.eval(suppress, &Focus { item: Some(item), position: 1, size: 1 }, &mut Env::default());
                            let failed = machine.trouble.borrow_mut().take().is_some();
                            if !failed && selected.items().iter().any(|selected| matches!(selected, Item::Node(_))) {
                                continue;
                            }
                        }
                        out.push(Finding {
                            file: file.path.clone(),
                            line: place("BeginLine"),
                            column: place("BeginColumn"),
                            rule: rule.name.clone(),
                            message: formatted(&rule.message, tree.image(*id).as_deref()),
                            symbol: None,
                            priority: None,
                        });
                        found += 1;
                    }
                }
            }
            local.push((1, started.elapsed().as_nanos(), found, trouble));
        }
        if let Some(limit) = std::env::var("NP_SLOW").ok().and_then(|limit| limit.parse::<u128>().ok()) {
            let spent: u128 = local.iter().map(|(_, nanos, _, _)| nanos / 1_000_000).sum();
            if spent > limit {
                let worst = rules.iter().zip(&local).max_by_key(|(_, (_, nanos, _, _))| *nanos).map(|(rule, _)| rule.name.as_str()).unwrap_or_default();
                eprintln!("slow: {spent} ms {} (most in {worst})", file.path);
            }
        }
        if let Ok(mut totals) = self.totals.lock() {
            for (rule, (files, nanos, found, trouble)) in rules.iter().zip(local) {
                let entry = totals.entry(rule.name.clone()).or_insert((0, 0, 0, None));
                entry.0 += files;
                entry.1 += nanos;
                entry.2 += found;
                if entry.3.is_none() {
                    entry.3 = trouble.map(|trouble| format!("{}: {trouble}", file.path));
                }
            }
        }
    }
}

/// A rule message as PMD prints it: `java.text.MessageFormat` reads it with the image of the node as its one
/// argument, so `{0}` is the image, a lone `'` starts or ends literal text and `''` is one `'`.
fn formatted(pattern: &str, image: Option<&str>) -> String {
    let mut out = String::with_capacity(pattern.len());
    let mut literal = false;
    let mut rest = pattern;
    while let Some(next) = rest.chars().next() {
        if let Some(after) = rest.strip_prefix("''") {
            out.push('\'');
            rest = after;
        } else if next == '\'' {
            literal = !literal;
            rest = &rest[1..];
        } else if let Some(after) = rest.strip_prefix("{0}").filter(|_| !literal) {
            out.push_str(image.unwrap_or("null"));
            rest = after;
        } else {
            out.push(next);
            rest = &rest[next.len_utf8()..];
        }
    }
    out
}

fn refuse(problem: &str) -> ! {
    eprintln!("nitpicker-engine: {problem}");
    std::process::exit(2)
}
