//! Backward over a body: at each point, the paths whose current value is dereferenced on every way out of the
//! body that does not go through an exception handler. A `throw` statement and a `return` are ways out.
use super::effects::{Effect, Unit};
use crate::java::flow::cfg::Exit;

pub type Bits = Vec<u64>;

pub fn has(bits: &Bits, path: usize) -> bool {
    bits.get(path / 64).is_some_and(|word| word & (1 << (path % 64)) != 0)
}

fn set(bits: &mut Bits, path: usize, on: bool) {
    if let Some(word) = bits.get_mut(path / 64) {
        if on {
            *word |= 1 << (path % 64);
        } else {
            *word &= !(1 << (path % 64));
        }
    }
}

fn both(a: &Bits, b: &Bits) -> Bits {
    a.iter().zip(b).map(|(a, b)| a & b).collect()
}

/// The set where each block starts and where it ends.
pub fn run(unit: &Unit) -> (Vec<Bits>, Vec<Bits>) {
    let words = unit.finder.all.len() / 64 + 1;
    let blocks = &unit.cfg.blocks;
    let mut starts: Vec<Bits> = vec![vec![u64::MAX; words]; blocks.len()];
    let mut ends: Vec<Bits> = vec![vec![0; words]; blocks.len()];
    let mut changed = true;
    while changed {
        changed = false;
        for block in (0..blocks.len()).rev() {
            let mut now = match &blocks[block].exit {
                Exit::End => vec![0; words],
                Exit::Jump(to) => starts[*to].clone(),
                Exit::Branch(_, holds, fails) => both(&starts[*holds], &starts[*fails]),
                Exit::Any(all) => all.iter().fold(vec![if all.is_empty() { 0 } else { u64::MAX }; words], |kept, to| both(&kept, &starts[*to])),
            };
            if let Some(test) = &unit.tests[block] {
                set(&mut now, test.path, false);
            }
            ends[block] = now.clone();
            for effects in unit.effects[block].iter().rev() {
                for effect in effects.iter().rev() {
                    match effect {
                        Effect::Deref { path: Some(path), .. } => set(&mut now, *path, true),
                        Effect::Deref { .. } => {}
                        Effect::Assign { to, sources, .. } => {
                            let wanted = has(&now, *to);
                            set(&mut now, *to, false);
                            for dependent in &unit.dependents[*to] {
                                set(&mut now, *dependent, false);
                            }
                            if wanted {
                                for source in sources {
                                    set(&mut now, *source, true);
                                }
                            }
                        }
                        Effect::Invalidate => {
                            for path in &unit.of_this {
                                set(&mut now, *path, false);
                            }
                        }
                        Effect::Checked(path) => set(&mut now, *path, false),
                        Effect::Asserted => now.iter_mut().for_each(|word| *word = 0),
                    }
                }
            }
            if now != starts[block] {
                starts[block] = now;
                changed = true;
            }
        }
    }
    (starts, ends)
}
