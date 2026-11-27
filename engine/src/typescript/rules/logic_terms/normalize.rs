//! `normalize` of `shared/logic/normalize.mts` for expressions: rewrite passes, children before parents and at most
//! one rewrite per node in a pass, until a pass changes nothing or a hundred passes ran.
use super::rewrites::rewrite_once;
use super::{is_statement, Term};

const MAX_PASSES: usize = 100;

fn child_context(node: &Term, index: usize, boolean_context: bool) -> bool {
    match node.kind {
        "if" => index == 0,
        "unary" => node.value() == Some("!"),
        "logical" => node.value() != Some("??") && boolean_context,
        "conditional" => index == 0 || boolean_context,
        _ => false,
    }
}

fn rewrite_pass(node: &Term, boolean_context: bool, changed: &mut bool) -> Term {
    let children = node.children.iter().enumerate().map(|(index, child)| rewrite_pass(child, child_context(node, index, boolean_context), changed)).collect();
    let rebuilt = Term { children, ..node.clone_shallow() };
    if is_statement(&rebuilt) {
        return rebuilt;
    }
    match rewrite_once(&rebuilt, boolean_context) {
        Some(rewritten) => {
            *changed = true;
            rewritten
        }
        None => rebuilt,
    }
}

impl Term {
    fn clone_shallow(&self) -> Term {
        Term { kind: self.kind, value: self.value.clone(), children: Vec::new(), loose: self.loose, assignment: self.assignment }
    }
}

pub fn normalize(root: &Term, boolean_context: bool) -> Term {
    let mut current = root.clone();
    for _ in 0..MAX_PASSES {
        let mut changed = false;
        current = rewrite_pass(&current, boolean_context, &mut changed);
        if !changed {
            break;
        }
    }
    current
}
