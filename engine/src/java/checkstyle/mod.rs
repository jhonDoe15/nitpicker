mod coding;
mod comments;
pub mod javadoc;
mod jdoc;
mod legacy;
mod naming;
mod position;
mod report;
mod tokens;

use crate::engine::FileRule;
use crate::engine::finding::Finding;
use crate::engine::source::SourceFile;
use report::Report;

/// The checks of the Checkstyle configuration a Java run writes. A file the engine cannot read the way Checkstyle
/// does gets one finding of rule `CheckstyleUnparsed` instead, so the caller hands that file to Checkstyle.
pub struct Checkstyle;

pub const UNPARSED: &str = "CheckstyleUnparsed";

impl FileRule for Checkstyle {
    fn id(&self) -> &'static str {
        "Checkstyle"
    }
    fn check(&self, file: &SourceFile, out: &mut Vec<Finding>) {
        if file.path.ends_with("module-info.java") {
            return;
        }
        let mut report = Report::new(file);
        if file.tree.root_node().has_error() || !run(file, &mut report) {
            report.findings.clear();
            report.push(1, 0, UNPARSED, String::new());
        }
        report.findings.sort();
        report.findings.dedup();
        out.append(&mut report.findings);
    }
}

fn run(file: &SourceFile, report: &mut Report) -> bool {
    legacy::check(file, report);
    naming::check(file, report);
    coding::check(file, report);
    tokens::check(file, report);
    let root = file.tree.root_node();
    for comment in javadoc_comments(&file.text) {
        let Ok(parsed) = javadoc::parse(&comment.body, comment.line, comment.col + 3) else {
            return false;
        };
        match position::documented(&file.text, root, &comment) {
            Some(declaration) => {
                let doc = jdoc::Doc {
                    file,
                    comment: &comment,
                    root: &parsed.root,
                    declaration,
                };
                jdoc::check(&doc, report);
            }
            None => {
                let text = "Javadoc comment is placed in the wrong location.".to_string();
                report.at(
                    comment.line,
                    Some(comment.col),
                    &jdoc::source("InvalidJavadocPosition"),
                    text,
                );
            }
        }
    }
    true
}

pub use comments::javadoc_comments;

pub fn dump(args: &[String]) {
    let list = args
        .iter()
        .position(|arg| arg == "--files")
        .map(|at| args[at + 1].clone())
        .expect("--files");
    let out = args
        .iter()
        .position(|arg| arg == "--out")
        .map(|at| args[at + 1].clone())
        .expect("--out");
    let mut text = String::new();
    for path in std::fs::read_to_string(list).expect("list").lines() {
        let Some(source) = crate::engine::source::read_text(std::path::Path::new(path)) else {
            continue;
        };
        for comment in javadoc_comments(&source) {
            let parsed = javadoc::parse(&comment.body, comment.line, comment.col + 3);
            let status = if parsed.is_ok() { "-" } else { "error" };
            text.push_str(&format!(
                "@ {path}\t{}\t{}\t?\t{status}\t?\n",
                comment.line, comment.col
            ));
            if let Ok(parsed) = parsed {
                print(&parsed.root, 0, &mut text);
            }
        }
    }
    std::fs::write(out, text).expect("write");
}

fn print(node: &javadoc::JNode, depth: usize, out: &mut String) {
    let text = node
        .text
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t");
    out.push_str(&format!(
        "{depth} {} {}:{} {text}\n",
        node.kind, node.line, node.col
    ));
    for child in &node.children {
        print(child, depth + 1, out);
    }
}
