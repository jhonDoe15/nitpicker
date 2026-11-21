//! The order SpotBugs visits the classes of a run in. What it knows about a field while it looks at one class
//! depends on the classes it has already seen. Measured on test code: the order starts as that of a Java hash
//! table keyed by the class name with slashes, sized for the number of classes of the run. A class that calls a
//! class not visited yet is put off until the others are done, and the classes put off come last first. Calls
//! between classes that call each other, directly or through others, put nothing off.
use super::names;
use crate::java::types::index::TypeIndex;
use std::collections::{HashMap, HashSet};

fn java_hash(text: &str) -> u32 {
    text.encode_utf16().fold(0u32, |hash, unit| hash.wrapping_mul(31).wrapping_add(u32::from(unit)))
}

fn capacity(classes: usize) -> u32 {
    let mut size = 16u32;
    while classes * 4 > size as usize * 3 {
        size *= 2;
    }
    size
}

fn slot(index: &TypeIndex, class: &str) -> u32 {
    let hash = java_hash(&names::binary_in(index, class).replace('.', "/"));
    (hash ^ (hash >> 16)) & (capacity(index.source_classes) - 1)
}

/// Groups of classes that call each other in a circle: every class gets the number of its group.
fn circles(calls: &HashMap<String, HashSet<String>>) -> HashMap<&str, usize> {
    let mut found: HashMap<&str, usize> = HashMap::new();
    let mut entered: HashMap<&str, (usize, usize)> = HashMap::new();
    let mut open: Vec<&str> = Vec::new();
    let mut counter = 0;
    for start in calls.keys() {
        if entered.contains_key(start.as_str()) {
            continue;
        }
        let mut path: Vec<(&str, Vec<&str>)> = vec![(start.as_str(), callees(calls, start))];
        entered.insert(start.as_str(), (counter, counter));
        open.push(start.as_str());
        counter += 1;
        while let Some((class, rest)) = path.last_mut() {
            let class = *class;
            match rest.pop() {
                Some(next) if !entered.contains_key(next) => {
                    entered.insert(next, (counter, counter));
                    open.push(next);
                    counter += 1;
                    path.push((next, callees(calls, next)));
                }
                Some(next) => {
                    if !found.contains_key(next) {
                        let reached = entered[next].0;
                        let own = entered.get_mut(class).expect("entered");
                        own.1 = own.1.min(reached);
                    }
                }
                None => {
                    path.pop();
                    let (first, lowest) = entered[class];
                    if let Some((above, _)) = path.last() {
                        let own = entered.get_mut(*above).expect("entered");
                        own.1 = own.1.min(lowest);
                    }
                    if first == lowest {
                        while let Some(member) = open.pop() {
                            found.insert(member, first);
                            if member == class {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    found
}

fn callees<'c>(calls: &'c HashMap<String, HashSet<String>>, class: &str) -> Vec<&'c str> {
    calls.get(class).into_iter().flatten().map(String::as_str).filter(|callee| calls.contains_key(*callee)).collect()
}

/// Where each class of the run comes in SpotBugs' order: whether it is put off, and its place in the hash table.
pub struct Visits {
    places: HashMap<String, (bool, u32)>,
}

impl Visits {
    pub fn of(index: &TypeIndex, calls: &HashMap<String, HashSet<String>>) -> Visits {
        let groups = circles(calls);
        let mut classes: Vec<(&str, u32)> = calls.keys().map(|class| (class.as_str(), slot(index, class))).collect();
        classes.sort_by_key(|(_, place)| *place);
        let mut places: HashMap<String, (bool, u32)> = HashMap::new();
        for (class, place) in classes {
            let waits = callees(calls, class).into_iter().any(|callee| {
                groups.get(callee) != groups.get(class) && places.get(callee).is_none_or(|(late, at)| *late || *at >= place)
            });
            places.insert(class.to_string(), (waits, place));
        }
        Visits { places }
    }

    /// Whether SpotBugs has been through `first` when it looks at `second`. Two classes in the same slot come in
    /// the order the classes were handed over, which the sources do not tell: taken as not before.
    pub fn before(&self, first: &str, second: &str) -> bool {
        match (self.places.get(first), self.places.get(second)) {
            (Some((false, first)), Some((false, second))) => first < second,
            (Some((true, first)), Some((true, second))) => first > second,
            (Some((late, _)), Some(_)) => !late,
            _ => false,
        }
    }
}
