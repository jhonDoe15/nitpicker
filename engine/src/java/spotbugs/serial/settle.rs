//! Decides the waiting SE_BAD_FIELD findings once the run is read. SpotBugs knows the classes of the run and the
//! classes their compiled form names. A class that cannot be serialized and has no known subclass is a sure case
//! (priority 1 in a class that commits to serialization, else 2). An interface, an abstract class or a class with
//! known subclasses is a likely case (priority 2 in a class that commits or declares a `serialVersionUID`, else
//! 3) unless a serializable class is known below it. A `Throwable` lowers each by one.
use super::Pending;
use crate::java::types::model::flag::ABSTRACT;
use crate::engine::finding::Finding;
use crate::java::types::project::JavaProject;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

const QUIET: &[&str] = &["java.lang.Object", "java.lang.Iterable", "java.lang.CharSequence", "java.lang.Comparable", "java.lang.Cloneable"];

#[derive(Default)]
pub struct Serial {
    referenced: Mutex<HashSet<String>>,
    loaded: Mutex<HashSet<String>>,
    pending: Mutex<Vec<Pending>>,
    /// SE_COMPARATOR_SHOULD_BE_SERIALIZABLE findings, with the classes their fields hold: one that likely cannot be
    /// serialized hides the finding (priority 3).
    comparators: Mutex<Vec<(Finding, Vec<String>)>>,
}

impl Serial {
    pub fn note_comparators(&self, found: Vec<(Finding, Vec<String>)>) {
        if !found.is_empty() {
            self.comparators.lock().expect("comparators").extend(found);
        }
    }

    pub fn note(&self, (referenced, loaded): (Vec<String>, Vec<String>), pending: Vec<Pending>) {
        self.referenced.lock().expect("referenced").extend(referenced);
        self.loaded.lock().expect("loaded").extend(loaded);
        if !pending.is_empty() {
            self.pending.lock().expect("pending").extend(pending);
        }
    }

    pub fn settle(&self, project: &JavaProject, out: &mut Vec<Finding>) {
        let pending: Vec<Pending> = self.pending.lock().expect("pending").drain(..).collect();
        let comparators: Vec<(Finding, Vec<String>)> = self.comparators.lock().expect("comparators").drain(..).collect();
        if pending.is_empty() && comparators.is_empty() {
            return;
        }
        let mut known: Vec<String> = project.sources.keys().cloned().collect();
        known.extend(self.referenced.lock().expect("referenced").iter().cloned());
        let loaded = self.loaded.lock().expect("loaded");
        known.extend(loaded.iter().cloned());
        known.sort();
        known.dedup();
        let named = known.clone();
        known.extend(project.index.nested_in(&loaded));
        known.sort();
        known.dedup();
        let known = Known { project, known, named };
        let mut tiers: HashMap<String, Option<u8>> = HashMap::new();
        for (finding, held) in comparators {
            if !held.iter().any(|class| tiers.entry(class.clone()).or_insert_with(|| known.tier(class)).is_some()) {
                out.push(finding);
            }
        }
        for mut waiting in pending {
            let tier = waiting.held.iter().filter_map(|class| *tiers.entry(class.clone()).or_insert_with(|| known.tier(class))).min();
            let Some(tier) = tier else { continue };
            let lowered = if tier == 0 { !waiting.committed } else { !(waiting.committed || waiting.versioned) };
            let priority = 1 + tier + u8::from(lowered) + u8::from(waiting.throwable) + u8::from(waiting.inner && !waiting.committed);
            if priority <= 2 {
                waiting.finding.priority = Some(priority);
                out.push(waiting.finding);
            }
        }
    }
}

struct Known<'a> {
    project: &'a JavaProject,
    known: Vec<String>,
    /// The known classes without the member classes of loaded ones.
    named: Vec<String>,
}

impl Known<'_> {
    /// 0 for a class that surely cannot be serialized, 1 for one that likely cannot, nothing otherwise.
    fn tier(&self, class: &str) -> Option<u8> {
        let index = &self.project.index;
        if class == "!" {
            return Some(0);
        }
        if QUIET.contains(&class) || index.is_subtype(class, "java.io.Serializable") {
            return None;
        }
        let info = index.get(class)?;
        let open = info.is_interface || info.flags & ABSTRACT != 0;
        if !open {
            let serializable = |name: &&String| name.as_str() != class && index.is_subtype(name, class) && index.is_subtype(name, "java.io.Serializable");
            return Some(u8::from(self.named.iter().any(|name| serializable(&name))));
        }
        let below: Vec<&String> = self.known.iter().filter(|name| name.as_str() != class && index.is_subtype(name, class)).collect();
        let serializable = below.into_iter().any(|name| {
            let Some(info) = index.get(name) else { return false };
            let first = info.is_interface || info.superclass.as_ref().is_none_or(|above| above == class || !index.is_subtype(above, class));
            first && index.is_subtype(name, "java.io.Serializable")
        });
        (!serializable).then_some(1)
    }
}
