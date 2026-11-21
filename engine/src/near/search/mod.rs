mod hashes;
mod similarity;

use crate::near::canonical::canonical_tree;
use crate::near::keys::{ABSTRACT, digest, key_of};
use crate::near::text::{mapped_surrogates, without_lone};
use crate::near::tree::{RawNode, Tree, pre_order, size_of, write_json};
use hashes::{skeleton_key, statement_hashes, token_label};
use similarity::{Searchable, candidate_pairs, searchable};
use std::collections::{BTreeSet, HashMap};

pub const MIN_RUN_NODES: usize = 30;

pub struct Prepared {
    pub size: usize,
    pub rewritten: bool,
    pub plain_key: String,
    pub tree: String,
    labels: Vec<String>,
    skeleton: String,
    hashes: Vec<(bool, u32, u32)>,
}

impl Prepared {
    pub fn large(&self) -> bool {
        self.size >= MIN_RUN_NODES
    }
}

pub fn prepare(original: Tree) -> Prepared {
    let canonical = canonical_tree(original);
    let tree = canonical.tree;
    let size = size_of(&tree);
    if size < MIN_RUN_NODES {
        return Prepared {
            size,
            rewritten: canonical.rewritten,
            plain_key: String::new(),
            tree: String::new(),
            labels: Vec::new(),
            skeleton: String::new(),
            hashes: Vec::new(),
        };
    }
    let plain = if canonical.rewritten { &canonical.original } else { &tree };
    let mut nodes = Vec::new();
    pre_order(&tree, &mut nodes);
    let labels = nodes.into_iter().filter(|node| !node.is("none")).map(|node| token_label(node)).collect();
    let mut json = String::new();
    write_json(&mut json, &tree);
    Prepared {
        size,
        rewritten: canonical.rewritten,
        plain_key: digest(&key_of(plain, &ABSTRACT)),
        tree: json,
        labels,
        skeleton: without_lone(&skeleton_key(&tree)).into_owned(),
        hashes: statement_hashes(&tree).into_iter().collect(),
    }
}

pub fn parse_tree(line: &str) -> Result<Tree, serde_json::Error> {
    let Some(line) = mapped_surrogates(line) else {
        return Err(serde::de::Error::custom("the input holds characters reserved for lone surrogates"));
    };
    let mut input = serde_json::Deserializer::from_str(&line);
    input.disable_recursion_limit();
    let raw: RawNode = serde::Deserialize::deserialize(&mut input)?;
    input.end()?;
    Ok(crate::near::tree::normalized(raw))
}

pub fn searchables(prepared: &mut [Prepared]) -> Vec<Option<Searchable>> {
    let mut vocabulary: HashMap<String, u32> = HashMap::new();
    prepared
        .iter_mut()
        .map(|unit| {
            if !unit.large() {
                return None;
            }
            let tokens = std::mem::take(&mut unit.labels)
                .into_iter()
                .map(|label| {
                    let next = u32::try_from(vocabulary.len()).expect("vocabulary");
                    *vocabulary.entry(label).or_insert(next)
                })
                .collect();
            let hashes = std::mem::take(&mut unit.hashes);
            Some(searchable(tokens, std::mem::take(&mut unit.skeleton), hashes))
        })
        .collect()
}

pub fn list_pairs(choices: &[Vec<usize>], units: &[Option<Searchable>]) -> (Vec<usize>, BTreeSet<(usize, usize)>) {
    let members: Vec<usize> = choices
        .iter()
        .filter_map(|options| options.iter().copied().find(|index| units.get(*index).is_some_and(Option::is_some)))
        .collect();
    let listed: Vec<&Searchable> =
        members.iter().map(|index| units[*index].as_ref().expect("large unit")).collect();
    let pairs = candidate_pairs(&listed);
    (members, pairs)
}
