//! What DumbMethods reports for one method: findings with the same pattern, message and place make one, the better
//! priority kept, of equal ones the first in the code.
use super::super::{Context, place};
use tree_sitter::Node;

pub struct Found<'a> {
    pub pattern: &'static str,
    pub node: Node<'a>,
    pub line: usize,
    pub priority: u8,
    pub message: String,
    pub place: Option<String>,
    pub arguments: Vec<String>,
}

#[derive(Default)]
pub struct Findings<'a> {
    kept: Vec<Found<'a>>,
}

impl<'a> Findings<'a> {
    pub fn add(&mut self, found: Found<'a>) {
        match self.kept.iter_mut().find(|kept| kept.pattern == found.pattern && kept.message == found.message && kept.place == found.place) {
            Some(kept) if found.priority < kept.priority => *kept = found,
            Some(_) => {}
            None => self.kept.push(found),
        }
    }

    pub fn report(self, context: &Context, label: &str) {
        for found in self.kept.into_iter().filter(|found| found.priority <= 2) {
            let shown = found.place.unwrap_or_else(|| place::function(label));
            context.report_listed(found.pattern, found.node, found.line, found.message, shown, found.priority, found.arguments);
        }
    }
}
