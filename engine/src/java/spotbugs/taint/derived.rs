//! Findings whose value comes from parameters of their method wait for the whole run: each parameter takes the
//! worst value that the calls of the run hand it, also through the parameters of other methods. The bodies that
//! hold no sink are not worked out while the run reads them; the calls they make are noted, and the bodies that
//! call a method with a waiting finding are worked out at the end, and then those that call them in turn.
use super::calls::{Key, Site};
use super::flow::{Flow, Mode, Shared};
use super::{Level, THIS};
use crate::engine::finding::Finding;
use crate::java::types::project::JavaProject;
use crate::java::spotbugs::nulls::Elsewhere;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tree_sitter::Node;

/// A finding whose value comes from parameters of its method, waiting for the calls of the run.
pub struct Waiting {
    pub method: Key,
    pub params: u64,
    pub level: Level,
    pub finding: Finding,
}

/// A body not worked out yet: the class whose file holds it, the class it belongs to, the method it is, and
/// where it and its parameters sit in the file.
pub struct Body {
    pub file: String,
    pub own: String,
    pub method: Option<Key>,
    pub at: (usize, usize, u16),
    pub parameters: Option<(usize, usize, u16)>,
}

/// Findings that parameters reach, and the calls of the run with the method making each. Calls made in
/// anonymous classes are not kept: they do not count.
#[derive(Default)]
pub struct Derived {
    pub waiting: Mutex<Vec<Waiting>>,
    pub sites: Mutex<Vec<(Option<Key>, Site)>>,
    pub bodies: Mutex<Vec<Body>>,
    /// The bodies not worked out yet that call each method of the run.
    pub callers: Mutex<HashMap<Key, Vec<usize>>>,
}

/// What the calls of the run hand a parameter, worst last: no call, or only values that come from parameters
/// nothing is known about (`None`), then safe, unknown and tainted values.
type Handed = Option<Level>;

/// What each parameter is handed by the calls of the run, worked out until nothing changes.
fn parameters(sites: &[(Option<Key>, Site)]) -> HashMap<(Key, usize), Handed> {
    let mut levels: HashMap<(Key, usize), Handed> = HashMap::new();
    loop {
        let mut next: HashMap<(Key, usize), Handed> = HashMap::new();
        for (caller, site) in sites {
            for (position, argument) in site.arguments.iter().enumerate() {
                let params = argument.params & !THIS;
                let mut handed = if params == 0 || argument.level > Level::Safe { Some(argument.level) } else { None };
                if argument.params & THIS != 0 {
                    handed = handed.max(Some(Level::Unknown));
                }
                for bit in (0..63).filter(|bit| params & (1 << bit) != 0) {
                    let from = caller.as_ref().and_then(|caller| levels.get(&(caller.clone(), bit)).copied().flatten());
                    handed = handed.max(from.or(if caller.is_none() { Some(Level::Unknown) } else { None }));
                }
                let known = next.entry((site.callee.clone(), position)).or_default();
                *known = (*known).max(handed);
            }
        }
        if next == levels {
            return levels;
        }
        levels = next;
    }
}

fn find<'a>(root: Node<'a>, (start, end, kind): (usize, usize, u16)) -> Option<Node<'a>> {
    let mut node = root.descendant_for_byte_range(start, end)?;
    while node.kind_id() != kind || node.start_byte() != start || node.end_byte() != end {
        node = node.parent()?;
    }
    Some(node)
}

impl Derived {
    /// Works out a body noted earlier and keeps the calls it makes.
    fn work(&self, project: &JavaProject, elsewhere: &Elsewhere, body: &Body) {
        let found = elsewhere.within(project, &body.file, |other| {
            let root = other.file.tree.root_node();
            let node = find(root, body.at)?;
            let parameters = body.parameters.and_then(|at| find(root, at));
            let shared = Shared::new(other);
            let flow = Flow::new(&shared, &body.own, node, parameters, Mode::Report).run();
            Some(flow.sites)
        });
        if let (Some(Some(sites)), Ok(mut known)) = (found, self.sites.lock()) {
            known.extend(sites.into_iter().map(|site| (body.method.clone(), site)));
        }
    }

    /// Works out the bodies that call the methods with waiting findings, then those that hand these calls their
    /// own parameters, until no new method needs its callers.
    fn reach(&self, project: &JavaProject, elsewhere: &Elsewhere, waiting: &[Waiting]) {
        let (Ok(bodies), Ok(callers)) = (self.bodies.lock(), self.callers.lock()) else { return };
        let mut pending: Vec<Key> = waiting.iter().map(|waiting| waiting.method.clone()).collect();
        let mut asked: HashSet<Key> = HashSet::new();
        let mut worked: HashSet<usize> = HashSet::new();
        while let Some(method) = pending.pop() {
            if !asked.insert(method.clone()) {
                continue;
            }
            for body in callers.get(&method).into_iter().flatten().copied() {
                if worked.insert(body) {
                    self.work(project, elsewhere, &bodies[body]);
                }
            }
            let Ok(sites) = self.sites.lock() else { return };
            for (caller, site) in sites.iter() {
                let passes = site.callee == method && site.arguments.iter().any(|argument| argument.params & !THIS != 0);
                pending.extend(caller.iter().filter(|_| passes).cloned());
            }
        }
    }

    pub fn settle(&self, project: &JavaProject, elsewhere: &Elsewhere, out: &mut Vec<Finding>) {
        let Ok(mut waiting) = self.waiting.lock() else { return };
        if waiting.is_empty() {
            return;
        }
        self.reach(project, elsewhere, &waiting);
        let Ok(sites) = self.sites.lock() else { return };
        let levels = parameters(&sites);
        for Waiting { method, params, level, mut finding } in waiting.drain(..) {
            let handed = (0..63).filter(|bit| params & (1 << bit) != 0).map(|bit| levels.get(&(method.clone(), bit)).copied().flatten().unwrap_or(Level::Unknown));
            let level = handed.fold(level, Level::max);
            if level != Level::Safe {
                finding.priority = Some(if level == Level::Tainted { 1 } else { 2 });
                out.push(finding);
            }
        }
    }
}
