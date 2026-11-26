use super::{Doc, source};
use crate::java::checkstyle::report::{Report, expanded};

pub fn check(doc: &Doc, report: &mut Report) {
    content_location(doc, report);
    single_line(doc, report);
    leading_asterisks(doc, report);
}

fn content_location(doc: &Doc, report: &mut Report) {
    let body = &doc.comment.body;
    if !body.contains('\n') {
        return;
    }
    let content = |line: &str| {
        !line
            .trim_start_matches(|c: char| c == '*' || c.is_whitespace())
            .is_empty()
    };
    let first = body.split('\n').position(|line| content(line));
    if first.is_none_or(|index| index == 1) {
        return;
    }
    let text = "Javadoc content should start from the next line after /**.".to_string();
    report.at(
        doc.comment.line,
        Some(doc.comment.col),
        &source("JavadocContentLocation"),
        text,
    );
}

fn single_line(doc: &Doc, report: &mut Report) {
    if doc.comment.body.contains('\n') || doc.block_tags().next().is_none() {
        return;
    }
    let text = "Single-line Javadoc comment should be multi-line.".to_string();
    report.at(doc.comment.line, None, &source("SingleLineJavadoc"), text);
}

fn leading_asterisks(doc: &Doc, report: &mut Report) {
    let lines: Vec<&str> = doc.comment.body.split('\n').collect();
    let expected = expanded(report.line_text(doc.comment.line), doc.comment.col) + 2;
    for (index, line) in lines.iter().enumerate().skip(1) {
        let number = doc.comment.line + index;
        let full = report.line_text(number);
        let trimmed = line.trim_start_matches([' ', '\t', '\u{c}']);
        let last = index + 1 == lines.len();
        if trimmed.starts_with('*') {
            let level = expanded(full, line.len() - trimmed.len()) + 1;
            if level != expected {
                let text = format!(
                    "Leading asterisk has incorrect indentation level {level}, expected is {expected}."
                );
                report.at(
                    number,
                    Some(line.len() - trimmed.len()),
                    &source("JavadocLeadingAsteriskAlign"),
                    text,
                );
            }
        } else if last && trimmed.is_empty() {
            let full_trimmed = full.trim_start_matches([' ', '\t', '\u{c}']);
            let level = expanded(full, full.len() - full_trimmed.len()) + 1;
            if level != expected {
                let text = format!(
                    "Leading asterisk has incorrect indentation level {level}, expected is {expected}."
                );
                report.at(
                    number,
                    Some(full.len() - full_trimmed.len()),
                    &source("JavadocLeadingAsteriskAlign"),
                    text,
                );
            }
        } else if !(last && trimmed.is_empty()) {
            let text = "Javadoc line should start with leading asterisk.".to_string();
            report.at(number, None, &source("JavadocMissingLeadingAsterisk"), text);
        }
    }
}
