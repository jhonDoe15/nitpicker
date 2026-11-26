//! What the methods of other source files of the run do with null: which parameters they dereference on every
//! path and whether they never return null. A method is worked out the first time it is called from elsewhere,
//! as if its file were analysed on its own and the method asked first, in rounds: an answer of round `n` takes
//! the calls it makes into other files from round `n - 1`, and round 0 knows nothing of other files. Every answer
//! is then the same whichever file asks first, and calls going round in a circle end.
use super::super::Context;
use super::effects::Shared;
use crate::engine::source::SourceFile;
use crate::java::Java;
use crate::java::types::expr::Call;
use crate::java::types::project::JavaProject;
use crate::java::types::scope::{FileScope, Memory, Resolver};
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::RwLock;
use std::sync::atomic::{AtomicU64, Ordering};

type Key = (String, String, String, u8);

/// The round the analysis of a file asks for.
const ROUNDS: u8 = 2;
/// How many files each thread keeps parsed.
const KEPT: usize = 32;

static RUNS: AtomicU64 = AtomicU64::new(0);

thread_local! {
    /// The round answers are asked for on this thread: `ROUNDS` outside, one less inside each method worked out.
    static ROUND: Cell<Option<u8>> = const { Cell::new(None) };
    static PARSED: RefCell<Vec<((u64, String), Rc<Parsed>)>> = const { RefCell::new(Vec::new()) };
}

pub struct Elsewhere {
    run: u64,
    dereferences: RwLock<HashMap<Key, u64>>,
    never_null: RwLock<HashMap<Key, bool>>,
}

impl Default for Elsewhere {
    fn default() -> Self {
        Elsewhere { run: RUNS.fetch_add(1, Ordering::Relaxed), dereferences: RwLock::default(), never_null: RwLock::default() }
    }
}

fn key(call: &Call, round: u8) -> Key {
    (call.declaring.clone(), call.method.name.clone(), format!("{:?}", call.method.parameters), round)
}

/// A file read again, with what resolving its names and calls found so far.
struct Parsed {
    file: SourceFile,
    scope: FileScope,
    memory: RefCell<Memory>,
}

fn parsed(run: u64, path: &str) -> Option<Rc<Parsed>> {
    let kept = PARSED.with(|kept| kept.borrow().iter().find(|((known_run, known), _)| *known_run == run && known == path).map(|(_, parsed)| parsed.clone()));
    if kept.is_some() {
        return kept;
    }
    let file = crate::engine::runner::parse(&path.into(), &Java)?;
    let scope = FileScope::of(&file);
    let parsed = Rc::new(Parsed { file, scope, memory: RefCell::default() });
    PARSED.with(|kept| {
        let mut kept = kept.borrow_mut();
        if kept.len() >= KEPT {
            kept.remove(0);
        }
        kept.push(((run, path.to_string()), parsed.clone()));
    });
    Some(parsed)
}

impl Elsewhere {
    fn ask<T: Copy>(&self, project: &JavaProject, call: &Call, cache: &RwLock<HashMap<Key, T>>, empty: T, work: impl Fn(&Shared, &Call) -> (T, Vec<(Call, T)>)) -> Option<T> {
        let path = project.sources.get(&call.declaring)?;
        let round = ROUND.get().unwrap_or(ROUNDS);
        if round == 0 {
            return Some(empty);
        }
        let wanted = key(call, round - 1);
        if let Some(known) = cache.read().ok()?.get(&wanted) {
            return Some(*known);
        }
        let parsed = parsed(self.run, path)?;
        let resolver = Resolver::remembering(&project.index, &parsed.file, &parsed.scope, parsed.memory.take());
        let (context, _) = Context::of(&resolver, project, self, Some(Vec::new()));
        let outer = ROUND.replace(Some(round - 1));
        let (found, settled) = work(&Shared::new(&context), call);
        ROUND.set(outer);
        drop(context);
        *parsed.memory.borrow_mut() = resolver.memory();
        let mut cache = cache.write().ok()?;
        for (other, answer) in settled {
            cache.entry(key(&other, round - 1)).or_insert(answer);
        }
        cache.insert(wanted, found);
        Some(found)
    }

    /// The parameters a method of another source file of the run dereferences, when another file declares it.
    pub fn dereferences(&self, project: &JavaProject, call: &Call) -> Option<u64> {
        self.ask(project, call, &self.dereferences, 0, |shared, call| (shared.summary(call), shared.settled.take()))
    }

    /// Whether a method of another source file of the run never returns null, when another file declares it.
    pub fn never_null(&self, project: &JavaProject, call: &Call) -> Option<bool> {
        self.ask(project, call, &self.never_null, false, |shared, call| (shared.never_null(call), Vec::new()))
    }
}
