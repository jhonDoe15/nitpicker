//! Backtracking over the matcher's terms, continuation by continuation, as the specification's matchers run:
//! forward, or backward inside a lookbehind, where a sequence runs from its last term and characters are read
//! before the position.
use super::characters::{canonical, is_line_terminator, is_word};
use super::sets::Sets;
use super::{Assertion, Flags, Re};

const STEP_LIMIT: usize = 200_000;

type Capture = Option<(usize, usize)>;

struct State {
    captures: Vec<Capture>,
    steps: usize,
}

struct Matcher<'i> {
    input: &'i [u32],
    sets: Sets,
}

type Next<'k> = &'k mut dyn FnMut(usize, &mut State) -> bool;

impl Matcher<'_> {
    fn word_at(&self, at: Option<usize>, flags: Flags) -> bool {
        at.and_then(|at| self.input.get(at)).is_some_and(|code| is_word(*code, self.sets.unicode && flags.ignore_case))
    }

    fn asserts(&self, assertion: Assertion, at: usize, flags: Flags) -> bool {
        let before = at.checked_sub(1);
        match assertion {
            Assertion::Start => at == 0 || (flags.multiline && before.is_some_and(|before| is_line_terminator(self.input[before]))),
            Assertion::End => at == self.input.len() || (flags.multiline && is_line_terminator(self.input[at])),
            Assertion::Boundary => self.word_at(before, flags) != self.word_at(Some(at), flags),
            Assertion::NotBoundary => self.word_at(before, flags) == self.word_at(Some(at), flags),
        }
    }

    fn same(&self, left: u32, right: u32, flags: Flags) -> bool {
        left == right || (flags.ignore_case && canonical(left, self.sets.unicode) == canonical(right, self.sets.unicode))
    }

    fn unit(&self, at: usize, backward: bool) -> Option<(u32, usize)> {
        if backward {
            let before = at.checked_sub(1)?;
            Some((self.input[before], before))
        } else {
            self.input.get(at).map(|code| (*code, at + 1))
        }
    }

    fn back(&self, (indices, flags): (&[usize], Flags), at: usize, backward: bool, state: &mut State, next: Next) -> bool {
        let captured = indices.iter().find_map(|index| state.captures.get(*index).copied().flatten());
        let Some((start, end)) = captured else { return next(at, state) };
        let length = end - start;
        let from = if backward { at.checked_sub(length) } else { Some(at).filter(|at| at + length <= self.input.len()) };
        let Some(from) = from else { return false };
        if (0..length).all(|offset| self.same(self.input[start + offset], self.input[from + offset], flags)) {
            next(if backward { from } else { at + length }, state)
        } else {
            false
        }
    }

    fn seq(&self, items: &[Re], at: usize, backward: bool, state: &mut State, next: Next) -> bool {
        let split = if backward { items.split_last() } else { items.split_first() };
        match split {
            None => next(at, state),
            Some((first, rest)) => self.run(first, at, backward, state, &mut |after, state| self.seq(rest, after, backward, state, next)),
        }
    }

    fn look(&self, behind: bool, body: &Re, at: usize, state: &mut State) -> Option<Vec<Capture>> {
        let mut inner = State { captures: state.captures.clone(), steps: state.steps };
        let found = self.run(body, at, behind, &mut inner, &mut |_, _| true);
        state.steps = inner.steps;
        found.then_some(inner.captures)
    }

    fn again(&self, re: &Re, count: u64, (at, after): (usize, usize), backward: bool, state: &mut State, next: Next) -> bool {
        let Re::Repeat { min, .. } = re else { return false };
        (count < *min || after != at) && self.repeat(re, count + 1, after, backward, state, next)
    }

    fn iterate(&self, re: &Re, body: &Re, count: u64, at: usize, backward: bool, state: &mut State, next: Next) -> bool {
        self.run(body, at, backward, state, &mut |after, state| self.again(re, count, (at, after), backward, state, next))
    }

    fn repeat(&self, re: &Re, count: u64, at: usize, backward: bool, state: &mut State, next: Next) -> bool {
        let Re::Repeat { min, max, greedy, body, groups } = re else { return false };
        if max.is_some_and(|max| count >= max) {
            return next(at, state);
        }
        let range = groups.0..groups.1;
        let saved: Vec<Capture> = state.captures[range.clone()].to_vec();
        let clear = |state: &mut State| state.captures[range.clone()].iter_mut().for_each(|capture| *capture = None);
        let restore = |state: &mut State| state.captures[range.clone()].clone_from_slice(&saved);
        clear(state);
        let found = if count < *min {
            self.iterate(re, body, count, at, backward, state, next)
        } else if *greedy {
            self.iterate(re, body, count, at, backward, state, next) || {
                restore(state);
                next(at, state)
            }
        } else {
            restore(state);
            next(at, state) || {
                clear(state);
                self.iterate(re, body, count, at, backward, state, next)
            }
        };
        if !found {
            restore(state);
        }
        found
    }

    fn group(&self, (index, body): (usize, &Re), at: usize, backward: bool, state: &mut State, next: Next) -> bool {
        self.run(body, at, backward, state, &mut |end, state: &mut State| {
            let span = if backward { (end, at) } else { (at, end) };
            let saved = std::mem::replace(&mut state.captures[index], Some(span));
            next(end, state) || {
                state.captures[index] = saved;
                false
            }
        })
    }

    fn run(&self, re: &Re, at: usize, backward: bool, state: &mut State, next: Next) -> bool {
        state.steps += 1;
        if state.steps > STEP_LIMIT {
            return false;
        }
        match re {
            Re::Seq(items) => self.seq(items, at, backward, state, next),
            Re::Alt(items) => items.iter().any(|item| self.run(item, at, backward, state, next)),
            Re::Unit(set, flags) => match self.unit(at, backward) {
                Some((code, after)) => self.sets.matches(set, code, *flags) && next(after, state),
                None => false,
            },
            Re::Assert(assertion, flags) => self.asserts(*assertion, at, *flags) && next(at, state),
            Re::Look { behind, negative, body } => match (self.look(*behind, body, at, state), negative) {
                (Some(captures), false) => {
                    let saved = std::mem::replace(&mut state.captures, captures);
                    next(at, state) || {
                        state.captures = saved;
                        false
                    }
                }
                (None, true) => next(at, state),
                _ => false,
            },
            Re::Group(index, body) => self.group((*index, body), at, backward, state, next),
            Re::Repeat { .. } => self.repeat(re, 0, at, backward, state, next),
            Re::Back(indices, flags) => self.back((indices, *flags), at, backward, state, next),
        }
    }
}


/// Whether the terms match anywhere in the input, `None` when the search ran out of steps.
pub fn test(root: &Re, groups: usize, sets: Sets, input: &[u32]) -> Option<bool> {
    let matcher = Matcher { input, sets };
    let mut state = State { captures: vec![None; groups + 1], steps: 0 };
    for start in 0..=input.len() {
        state.captures.iter_mut().for_each(|capture| *capture = None);
        if matcher.run(root, start, false, &mut state, &mut |_, _| true) {
            return Some(true);
        }
    }
    if state.steps > STEP_LIMIT { None } else { Some(false) }
}
