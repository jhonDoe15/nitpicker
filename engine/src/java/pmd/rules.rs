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
    pub xpath: String,
    #[serde(default)]
    pub message: String,
    /// Rule properties other than the query; the query reads them as variables.
    #[serde(default)]
    pub properties: BTreeMap<String, Property>,
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
    query: Result<Expr, String>,
    properties: Env,
}

pub struct XPathRules {
    written: Vec<Written>,
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
        for rule in &written {
            if let Err(problem) = Parser::parse(&rule.xpath, rule.properties.keys().cloned().collect()) {
                refuse(&format!("rule {} has a query that cannot be read: {problem}", rule.name));
            }
        }
        Some(XPathRules { written, totals: Mutex::new(BTreeMap::new()) })
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
                                query: Parser::parse(&rule.xpath, rule.properties.keys().cloned().collect()).map(|(query, _)| query),
                                properties: rule
                                    .properties
                                    .values()
                                    .enumerate()
                                    .map(|(slot, property)| {
                                        let value = match property.kind.as_str() {
                                            "Boolean" => Item::Flag(property.value.trim() == "true"),
                                            "Integer" | "Long" => Item::Whole(property.value.trim().parse().unwrap_or(0)),
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
        for rule in rules.iter() {
            let started = std::time::Instant::now();
            let mut found = 0;
            let mut trouble = None;
            match &rule.query {
                Err(problem) => trouble = Some(format!("not parsed: {problem}")),
                Ok(query) => {
                    let mut env: Env = rule.properties.clone();
                    let result = machine.eval(query, &Focus { item: Some(&root), position: 1, size: 1 }, &mut env);
                    trouble = machine.trouble.borrow_mut().take();
                    if let Some(trouble) = &trouble {
                        // PMD reports no findings of a rule for a file on which the query fails.
                        out.push(Finding { file: file.path.clone(), line: 0, column: 0, rule: format!("!{}", rule.name), message: trouble.clone() });
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
                        out.push(Finding {
                            file: file.path.clone(),
                            line: place("BeginLine"),
                            column: place("BeginColumn"),
                            rule: rule.name.clone(),
                            message: rule.message.clone(),
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

fn refuse(problem: &str) -> ! {
    eprintln!("nitpicker-engine: {problem}");
    std::process::exit(2)
}
