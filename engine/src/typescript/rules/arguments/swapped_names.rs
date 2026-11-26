//! `findSwaps`: arguments named like another parameter of the called function, in the order the plugin rule
//! finds them.
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

static SUFFIX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:_[a-z]|[0-9]+)$").expect("pattern"));
const PAIRS: &[(&str, &str)] = &[("left", "right"), ("lhs", "rhs")];

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Swap {
    pub index: usize,
    pub other: usize,
}

pub fn plain_name(name: &str) -> String {
    name.trim_start_matches('_').to_lowercase()
}

fn stem_of(name: &str) -> String {
    SUFFIX.replace(&plain_name(name), "").into_owned()
}

fn is_single_letter(name: &str) -> bool {
    name.len() == 1 && name.bytes().all(|byte| byte.is_ascii_lowercase())
}

fn interchangeable(first: &str, second: &str) -> bool {
    let (one, two) = (plain_name(first), plain_name(second));
    if is_single_letter(&one) && is_single_letter(&two) {
        return true;
    }
    if PAIRS.iter().any(|(left, right)| (one == *left && two == *right) || (one == *right && two == *left)) {
        return true;
    }
    let stem = stem_of(first);
    !stem.is_empty() && stem == stem_of(second)
}

struct SwapCall<'c> {
    parameters: &'c [String],
    names: Vec<String>,
    given: &'c [Option<String>],
    count: usize,
    recursive: bool,
}

fn swap_at(call: &SwapCall, index: usize) -> Option<Swap> {
    let name = call.given[index].as_deref()?;
    let other = call.names.iter().position(|candidate| *candidate == plain_name(name))?;
    if other == index || other >= call.count {
        return None;
    }
    let slot = plain_name(call.given.get(other)?.as_deref()?);
    let exchange = call.names.get(index) == Some(&slot);
    let moved = other < index && !call.names.contains(&slot) && !call.recursive;
    let parameter = |at: usize| call.parameters.get(at).map_or("", String::as_str);
    let swapped = call.names.get(other) != Some(&slot) && (exchange || moved) && !interchangeable(parameter(index), parameter(other));
    swapped.then_some(Swap { index, other })
}

pub fn find_swaps(parameters: &[String], given: &[Option<String>], recursive: bool) -> Vec<Swap> {
    let count = parameters.len().min(given.len());
    let names: Vec<String> = parameters.iter().map(|parameter| plain_name(parameter)).collect();
    if names[..count].iter().collect::<HashSet<_>>().len() != count {
        return Vec::new();
    }
    let call = SwapCall { parameters, names, given, count, recursive };
    let mut swaps: Vec<Swap> = Vec::new();
    for index in 0..count {
        let Some(swap) = swap_at(&call, index) else { continue };
        if !swaps.iter().any(|found| found.index == swap.other && found.other == swap.index) {
            swaps.push(swap);
        }
    }
    swaps
}
