mod abbreviation;
mod names;
mod types;

use super::report::Report;
use crate::engine::source::{SourceFile, walk};

pub const NAMING: &str = "com.puppycrawl.tools.checkstyle.checks.naming.";

pub fn check(file: &SourceFile, report: &mut Report) {
    types::outer_type(file, report);
    walk(file.tree.root_node(), |node| {
        names::check(file, node, report);
        abbreviation::check(file, node, report);
        types::record_accessors(file, node, report);
    });
}
