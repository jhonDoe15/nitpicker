//! `no-copied-constant`: a literal in a test that copies the value of a constant of a production module the test
//! loads. Which modules are production code is the project layout's say: each finding says which modules it needs
//! to be production code (`production-source`) and which not (`non-production-source`) for the caller to answer.
mod extract;
mod graph;
mod literals;
mod module;
mod report;

use crate::engine::finding::Finding;
use crate::typescript::resolve::Modules;
use crate::typescript::rules::Context;
use graph::{Load, Outcome, leaves};
use module::{Key, reachable_keys};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

const RULE: &str = "no-copied-constant";
const ROOT: &str = "no-copied-constant.root";
const PRODUCTION: &str = "production-source";
const NOT_PRODUCTION: &str = "non-production-source";

struct Pending {
    start: u32,
    end: u32,
    message: String,
    conditions: Vec<(String, String)>,
}

fn root_of(context: &Context) -> PathBuf {
    context.setting(ROOT).map(PathBuf::from).or_else(|| std::env::current_dir().ok()).unwrap_or_default()
}

fn conditions_of(asked: &[(String, bool)]) -> Vec<(String, String)> {
    let kind = |production: bool| (if production { PRODUCTION } else { NOT_PRODUCTION }).to_string();
    asked.iter().map(|(file, production)| (kind(*production), file.clone())).collect()
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let (candidates, wanted) = literals::collect(view, scopes);
    if candidates.is_empty() {
        return;
    }
    let containing = Path::new(context.file.path);
    let loads: Vec<Load> = wanted
        .into_iter()
        .filter_map(|load| {
            let target = Modules::shared().project_file(&load.specifier, containing)?;
            Some(Load { specifier: load.specifier, names: load.names, whole: load.whole, target })
        })
        .collect();
    if loads.is_empty() {
        return;
    }
    let reachable: Vec<HashSet<Key>> = loads.iter().map(|load| reachable_keys(&load.target)).collect();
    let mut by_key: Vec<(Key, Vec<usize>)> = Vec::new();
    for (index, candidate) in candidates.iter().enumerate() {
        let key = candidate.value.key();
        if !reachable.iter().any(|keys| keys.contains(&key)) {
            continue;
        }
        match by_key.iter_mut().find(|(known, _)| *known == key) {
            Some((_, found)) => found.push(index),
            None => by_key.push((key, vec![index])),
        }
    }
    let root = root_of(context);
    let mut tokens: Option<Vec<(u32, u32, String)>> = None;
    let mut pending: Vec<Pending> = Vec::new();
    for (key, indexes) in by_key {
        let holding = loads.iter().zip(&reachable).filter(|(_, keys)| keys.contains(&key));
        let own: Vec<&Load> = holding.map(|(load, _)| load).collect();
        let Outcome::Leaves(found) = leaves(&root, &own, &key) else {
            let file = context.display().to_string();
            let rule = "!parse".to_string();
            let finding = Finding { file, line: 1, column: 1, rule, message: String::new(), symbol: None, priority: None, arguments: None };
            context.findings.push(finding.into());
            return;
        };
        for leaf in found.iter().filter(|leaf| !leaf.entries.is_empty()) {
            let mentions = leaf.entries.iter().flat_map(|entry| entry.mentions.iter());
            let mentioned: HashSet<&str> = mentions.map(String::as_str).collect();
            for index in &indexes {
                let candidate = &candidates[*index];
                let statement = literals::statement_of(candidate.node);
                let tokens = tokens.get_or_insert_with(|| literals::identifier_tokens(view));
                let first = tokens.partition_point(|(start, _, _)| *start < statement.start());
                let named = tokens[first..]
                    .iter()
                    .take_while(|(start, _, _)| *start < statement.end())
                    .any(|(_, end, name)| *end <= statement.end() && mentioned.contains(name.as_str()));
                if !named {
                    pending.push(Pending {
                        start: candidate.node.start(),
                        end: candidate.node.end(),
                        message: report::message(&candidate.value, &leaf.entries),
                        conditions: conditions_of(&leaf.asked),
                    });
                }
            }
        }
    }
    for found in pending {
        context.report_when(RULE, found.start, Some(found.end), found.message, found.conditions);
    }
}
