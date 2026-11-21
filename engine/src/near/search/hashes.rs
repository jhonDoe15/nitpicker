use crate::near::text::lone_unit;
use crate::near::tree::Node;
use std::collections::HashSet;
use std::fmt::Write;

const SEEDS: [u32; 2] = [0x811c_9dc5, 0x2545_f491];
const STEPS: [u32; 2] = [0x9e37_79b9, 0x7f4a_7c15];
const PRIME: u32 = 0x0100_0193;
const MIN_NODES: usize = 15;
const WINDOW: usize = 3;

pub type HashKey = (bool, u32, u32);

fn mix(hash: u32, value: u32) -> u32 {
    (hash ^ value).wrapping_mul(PRIME)
}

pub fn token_label(node: &Node) -> String {
    if node.is("name") {
        return if node.binding.as_deref() == Some("bound") { "b" } else { "f" }.to_string();
    }
    if node.is("literal") {
        return format!("l:{}", node.literal.as_deref().unwrap_or(""));
    }
    format!("{}={}", node.kind, node.value.as_deref().unwrap_or(""))
}

fn combine(start: [u32; 2], parts: &[([u32; 2], usize)]) -> [u32; 2] {
    let mut hashes = start;
    for (lane, hash) in hashes.iter_mut().enumerate() {
        for (part, _) in parts {
            *hash = mix(mix(*hash, part[lane]), STEPS[lane]);
        }
    }
    hashes
}

fn hashed(node: &Node, keys: &mut HashSet<HashKey>) -> ([u32; 2], usize) {
    let children: Vec<([u32; 2], usize)> = node.children.iter().map(|child| hashed(child, keys)).collect();
    let label = token_label(node);
    let points: Vec<u32> = label.chars().map(|character| lone_unit(character).unwrap_or(character as u32)).collect();
    let start = SEEDS.map(|seed| points.iter().fold(seed, |hash, point| mix(hash, *point)));
    let hashes = combine(start, &children);
    let size = children.iter().map(|(_, size)| size).sum::<usize>() + usize::from(!node.is("none"));
    if node.category() == "statement" && size >= MIN_NODES {
        keys.insert((false, hashes[0], hashes[1]));
    }
    if node.is("block") && children.len() >= WINDOW {
        for window in children.windows(WINDOW) {
            if window.iter().map(|(_, size)| size).sum::<usize>() >= MIN_NODES {
                let joined = combine(SEEDS, window);
                keys.insert((true, joined[0], joined[1]));
            }
        }
    }
    (hashes, size)
}

pub fn statement_hashes(tree: &Node) -> HashSet<HashKey> {
    let mut keys = HashSet::new();
    hashed(tree, &mut keys);
    keys
}

fn slot_label<'a>(node: &Node, child: &'a Node, index: usize) -> &'a str {
    let type_slot = matches!(&*node.kind, "function" | "parameter" | "declare" | "foreach") && index == 0;
    if type_slot {
        return "type";
    }
    if child.category() == "expression" && !node.is("evaluate") { "expression" } else { &child.kind }
}

fn skeleton(node: &Node, out: &mut String) {
    if matches!(node.category(), "expression" | "type") || node.is("parameters") {
        return;
    }
    out.push('(');
    write!(out, "{}={}/{}", node.kind, node.value.as_deref().unwrap_or(""), node.children.len()).expect("write");
    for (index, child) in node.children.iter().enumerate() {
        out.push(' ');
        out.push_str(slot_label(node, child, index));
    }
    for child in &node.children {
        skeleton(child, out);
    }
    out.push(')');
}

pub fn skeleton_key(tree: &Node) -> String {
    let mut out = String::new();
    skeleton(tree, &mut out);
    out
}
