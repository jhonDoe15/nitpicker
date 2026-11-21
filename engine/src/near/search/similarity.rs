use std::collections::{BTreeSet, HashMap};

const PERCENT: usize = 80;
const DICE_SCALE: usize = 200;
const FULL_BUCKET: usize = 16;
const BUCKET_NEIGHBOURS: usize = 4;

pub struct Searchable {
    pub tokens: Vec<u32>,
    pub bag: HashMap<u32, usize>,
    pub masks: HashMap<u32, Vec<u32>>,
    pub skeleton: String,
    pub hashes: Vec<(bool, u32, u32)>,
}

pub fn searchable(tokens: Vec<u32>, skeleton: String, hashes: Vec<(bool, u32, u32)>) -> Searchable {
    let words = tokens.len().div_ceil(32);
    let mut bag = HashMap::new();
    let mut masks: HashMap<u32, Vec<u32>> = HashMap::new();
    for (index, token) in tokens.iter().enumerate() {
        *bag.entry(*token).or_insert(0) += 1;
        masks.entry(*token).or_insert_with(|| vec![0; words])[index >> 5] |= 1 << (index & 31);
    }
    Searchable { tokens, bag, masks, skeleton, hashes }
}

pub fn partner_limit(size: usize) -> usize {
    if size > FULL_BUCKET { BUCKET_NEIGHBOURS } else { size }
}

fn similar_enough(common: usize, left: usize, right: usize) -> bool {
    DICE_SCALE * common >= PERCENT * (left + right)
}

fn bag_overlap(left: &HashMap<u32, usize>, right: &HashMap<u32, usize>) -> usize {
    let (small, large) = if left.len() <= right.len() { (left, right) } else { (right, left) };
    small.iter().map(|(token, count)| (*count).min(large.get(token).copied().unwrap_or(0))).sum()
}

fn lcs_length(left: &Searchable, tokens: &[u32]) -> usize {
    let words = left.tokens.len().div_ceil(32);
    let mut row = vec![u32::MAX; words];
    for token in tokens {
        let Some(mask) = left.masks.get(token) else { continue };
        let mut carry = 0u64;
        for (current, bits) in row.iter_mut().zip(mask) {
            let kept = *current & !bits;
            let sum = u64::from(*current) + u64::from(*current & bits) + carry;
            carry = sum >> 32;
            *current = (sum as u32) | kept;
        }
    }
    row.iter()
        .enumerate()
        .map(|(word, value)| {
            let bits = (left.tokens.len() - word * 32).min(32);
            (0..bits).filter(|bit| (value >> bit) & 1 == 0).count()
        })
        .sum()
}

fn similar(left: &Searchable, right: &Searchable) -> bool {
    let (one, other) = (left.tokens.len(), right.tokens.len());
    similar_enough(one.min(other), one, other)
        && similar_enough(bag_overlap(&left.bag, &right.bag), one, other)
        && similar_enough(lcs_length(left, &right.tokens), one, other)
}

fn index_pairs(units: &[&Searchable], pairs: &mut BTreeSet<(usize, usize)>) {
    let mut buckets: HashMap<(bool, u32, u32), Vec<usize>> = HashMap::new();
    for (position, unit) in units.iter().enumerate() {
        for key in &unit.hashes {
            buckets.entry(*key).or_default().push(position);
        }
    }
    for members in buckets.values() {
        let limit = partner_limit(members.len());
        for (offset, first) in members.iter().enumerate() {
            for second in members.iter().skip(offset + 1).take(limit) {
                pairs.insert((*first, *second));
            }
        }
    }
}

fn group_pairs(units: &[&Searchable], group: &[usize], pairs: &mut BTreeSet<(usize, usize)>) {
    let length = |position: usize| units[position].tokens.len();
    let mut order = group.to_vec();
    order.sort_by_key(|position| (length(*position), *position));
    let limit = partner_limit(order.len());
    for (at, shorter) in order.iter().enumerate() {
        for other in order.iter().skip(at + 1).take(limit) {
            let (one, two) = (length(*shorter), length(*other));
            if !similar_enough(one, one, two) {
                break;
            }
            let pair = ((*shorter).min(*other), (*shorter).max(*other));
            if !pairs.contains(&pair) && similar(units[pair.0], units[pair.1]) {
                pairs.insert(pair);
            }
        }
    }
}

pub fn candidate_pairs(units: &[&Searchable]) -> BTreeSet<(usize, usize)> {
    let mut pairs = BTreeSet::new();
    index_pairs(units, &mut pairs);
    let mut groups: HashMap<&str, Vec<usize>> = HashMap::new();
    for (position, unit) in units.iter().enumerate() {
        groups.entry(&unit.skeleton).or_default().push(position);
    }
    for group in groups.values().filter(|group| group.len() > 1) {
        group_pairs(units, group, &mut pairs);
    }
    pairs
}
