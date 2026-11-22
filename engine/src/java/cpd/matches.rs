//! PMD's CPD match search (`MatchAlgorithm`, `MatchCollector`), step for step: the same rolling hash over image
//! ids in Java `int` arithmetic, the same grouping by hash, the same pairing and merging of marks, and the same
//! final order (most tokens first, then the first mark).
use rayon::prelude::*;
use std::collections::{BTreeMap, BTreeSet, HashSet};

pub struct Code {
    /// Image id of each token, 0 for the end of a file.
    pub ids: Vec<i32>,
}

pub struct Match {
    pub tokens: u32,
    pub marks: BTreeSet<u32>,
}

const MOD: i32 = 37;

/// The hash groups with more than one token, each in token order. CPD visits them in the order of a Java
/// `HashMap`, but the order does not change its result: a token is in one group only, and every mark, pair and
/// merge of a match stays among the tokens of the group whose window the match starts with.
fn groups(code: &Code, window: usize) -> Vec<Vec<u32>> {
    let ids = &code.ids;
    let last_mod = (0..window).fold(1i32, |acc, _| acc.wrapping_mul(MOD));
    let mut hashed: Vec<(i32, u32)> = Vec::with_capacity(ids.len());
    let mut last_hash = 0i32;
    let mut i = ids.len() as isize - 1;
    while i >= 0 {
        let at = i as usize;
        if ids[at] != 0 {
            let last = ids[at + window];
            last_hash = MOD.wrapping_mul(last_hash).wrapping_add(ids[at]).wrapping_sub(last_mod.wrapping_mul(last));
            hashed.push((last_hash, at as u32));
        } else {
            last_hash = 0;
            let end = (i - window as isize + 1).max(0);
            while i > end {
                let token = ids[i as usize - 1];
                last_hash = MOD.wrapping_mul(last_hash).wrapping_add(token);
                if token == 0 {
                    break;
                }
                i -= 1;
            }
        }
        i -= 1;
    }
    hashed.par_sort_unstable();
    hashed
        .chunk_by(|a, b| a.0 == b.0)
        .filter(|group| group.len() > 1)
        .map(|group| group.iter().map(|&(_, at)| at).collect())
        .collect()
}

struct Collector<'a> {
    ids: &'a [i32],
    window: u32,
    tree: BTreeMap<u32, Vec<Match>>,
    seen: Pairs,
}

/// `MatchCollector.tokenMatchSets` for one group: which marks were paired, and the lowest partner of each (itself
/// included). A bit matrix over the group's marks while it stays small, a set of pairs beyond.
struct Pairs {
    marks: Vec<u32>,
    bits: Vec<u64>,
    wide: HashSet<u64>,
    lowest: Vec<u32>,
}

const MATRIX_MARKS: usize = 8192;

impl Pairs {
    fn new(marks: &[u32]) -> Pairs {
        let bits = if marks.len() <= MATRIX_MARKS { vec![0; (marks.len() * marks.len()).div_ceil(64)] } else { Vec::new() };
        Pairs { marks: marks.to_vec(), bits, wide: HashSet::new(), lowest: marks.to_vec() }
    }

    fn contains(&self, a: usize, b: usize) -> bool {
        if self.bits.is_empty() {
            self.wide.contains(&((a as u64) << 32 | b as u64))
        } else {
            let bit = a * self.marks.len() + b;
            self.bits[bit / 64] >> (bit % 64) & 1 == 1
        }
    }

    fn insert(&mut self, a: usize, b: usize) {
        if self.bits.is_empty() {
            self.wide.insert((a as u64) << 32 | b as u64);
        } else {
            let bit = a * self.marks.len() + b;
            self.bits[bit / 64] |= 1 << (bit % 64);
        }
        self.lowest[a] = self.lowest[a].min(self.marks[b]);
    }

    /// The places of the given marks (ascending, all in the group) among the group's marks.
    fn places<'a>(&'a self, marks: impl Iterator<Item = u32> + 'a) -> impl Iterator<Item = usize> + 'a {
        let mut at = 0;
        marks.map(move |mark| {
            while self.marks[at] != mark {
                at += 1;
            }
            at
        })
    }
}

impl Collector<'_> {
    fn ended(&self, first: u32, second: u32) -> bool {
        let (a, b) = (self.ids[first as usize], self.ids[second as usize]);
        a != b || a == 0 || b == 0
    }

    fn collect(&mut self, marks: &[u32]) {
        let mut i = 0;
        while i + 1 < marks.len() {
            let mut skipped = 0;
            let first = marks[i];
            for (j, &second) in marks.iter().enumerate().skip(i + 1) {
                let diff = i64::from(first) - i64::from(second);
                if -diff < i64::from(self.window) {
                    skipped += 1;
                    continue;
                }
                if first != 0 && !self.ended(first - 1, second - 1) {
                    continue;
                }
                if self.seen.contains(i, j) {
                    continue;
                }
                let mut dupes = 0u32;
                while !self.ended(first + dupes, second + dupes) {
                    dupes += 1;
                }
                if dupes < self.window || diff + i64::from(dupes) >= 1 {
                    continue;
                }
                self.report((first, i), (second, j), dupes);
            }
            i += skipped + 1;
        }
    }

    fn register(&mut self, first: usize, second: usize) {
        self.seen.insert(first, second);
        self.seen.insert(second, first);
    }

    /// What `MatchCollector.reportMatch` does with the new pair when it meets `found`. PMD walks the marks and
    /// stops at the first that decides; at most one of the three outcomes can hold for a match, so a range query
    /// finds the same one: with as many tokens any other mark merges, a longer match holds the pair when a mark
    /// starts before it close enough, a shorter one is replaced when a mark starts inside the new pair.
    fn meet(found: &Match, first: u32, second: u32, dupes: u32) -> Meeting {
        let other_than_first = |low: u32, high: u32| low <= high && found.marks.range(low..=high).any(|&mark| mark != first);
        if dupes == found.tokens {
            if found.marks.iter().any(|&mark| mark != first) { Meeting::Same } else { Meeting::Apart }
        } else if found.tokens > dupes {
            let low = (second + dupes).saturating_sub(found.tokens);
            if second > 0 && other_than_first(low, second - 1) { Meeting::Inside } else { Meeting::Apart }
        } else if other_than_first(second + 1, second + dupes - found.tokens) {
            Meeting::Covers
        } else {
            Meeting::Apart
        }
    }

    fn report(&mut self, (first, first_place): (u32, usize), (second, second_place): (u32, usize), dupes: u32) {
        let lowest = self.seen.lowest[first_place];
        let mut matches = self.tree.remove(&lowest).unwrap_or_default();
        let mut index = 0;
        while index < matches.len() {
            match Self::meet(&matches[index], first, second, dupes) {
                Meeting::Inside => {
                    self.tree.insert(lowest, matches);
                    return;
                }
                Meeting::Covers => {
                    matches.remove(index);
                }
                Meeting::Same => {
                    let places: Vec<usize> = self.seen.places(matches[index].marks.iter().copied()).collect();
                    for place in places {
                        self.register(place, second_place);
                    }
                    matches[index].marks.insert(second);
                    self.tree.insert(lowest, matches);
                    return;
                }
                Meeting::Apart => index += 1,
            }
        }
        matches.push(Match { tokens: dupes, marks: BTreeSet::from([first, second]) });
        self.tree.insert(lowest, matches);
        self.register(first_place, second_place);
    }
}

enum Meeting {
    Inside,
    Covers,
    Same,
    Apart,
}

/// CPD's matches, in report order. The groups do not touch each other, so they are searched in parallel.
pub fn find(code: &Code, window: usize) -> Vec<Match> {
    let groups = groups(code, window);
    let mut matches: Vec<(u32, Match)> = groups
        .par_iter()
        .flat_map_iter(|marks| {
            let mut collector = Collector { ids: &code.ids, window: window as u32, tree: BTreeMap::new(), seen: Pairs::new(marks) };
            collector.collect(marks);
            collector.tree.into_iter().flat_map(|(key, matches)| matches.into_iter().map(move |found| (key, found)))
        })
        .collect();
    matches.sort_by_key(|(key, found)| (std::cmp::Reverse(found.tokens), found.marks.first().copied(), *key));
    matches.into_iter().map(|(_, found)| found).collect()
}
