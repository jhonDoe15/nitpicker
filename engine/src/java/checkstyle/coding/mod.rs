mod distance;
mod flow;
mod order;
mod statements;

use super::report::Report;
use crate::engine::source::{SourceFile, walk};

pub const CODING: &str = "com.puppycrawl.tools.checkstyle.checks.coding.";

pub fn check(file: &SourceFile, report: &mut Report) {
    statements::check(file.tree.root_node(), report);
    walk(file.tree.root_node(), |node| {
        distance::check(file, node, report);
        flow::check(file, node, report);
        order::check(file, node, report);
    });
}
