use crate::engine::source::SourceFile;
use crate::java::checkstyle::report::Report;
use fancy_regex::Regex;
use std::sync::OnceLock;
use tree_sitter::Node;

const TODO: &str = "com.puppycrawl.tools.checkstyle.checks.TodoCommentCheck";

fn todo_format() -> &'static Regex {
    static FORMAT: OnceLock<Regex> = OnceLock::new();
    FORMAT.get_or_init(|| Regex::new(r"(?m)^[ \t]*(?!TODO\b)(?i:TODO)\b").expect("format"))
}

fn box_format() -> &'static Regex {
    static FORMAT: OnceLock<Regex> = OnceLock::new();
    FORMAT.get_or_init(|| Regex::new(r"(?m)^[ \t]*([*=#])\1{8,}[ \t]*$").expect("format"))
}

pub fn check(file: &SourceFile, node: Node, report: &mut Report) {
    let (content, single) = match node.kind() {
        "line_comment" => (line_content(file, node), true),
        "block_comment" => {
            let text = file.text_of(node);
            (
                text.get(2..text.len().saturating_sub(2).max(2))
                    .unwrap_or("")
                    .to_string(),
                false,
            )
        }
        _ => return,
    };
    let line = node.start_position().row + 1;
    let column = report.unit_column(node) + 2;
    if single && starts_without_space(&content) {
        let source = "com.puppycrawl.tools.checkstyle.checks.coding.MatchXpathCheck#singleLineCommentStartWithSpace";
        report.at(
            line,
            Some(column - 2),
            source,
            "'//' must be followed by a whitespace.".to_string(),
        );
    }
    let lines = content.replace("\r\n", "\n");
    if todo_format().is_match(&lines).unwrap_or(false) {
        report.at(
            line,
            Some(column),
            &format!("{TODO}#TodoFormat"),
            "The TODO tag must be written in capitals.".into(),
        );
    }
    if box_format().is_match(&lines).unwrap_or(false) {
        let message = "Comment uses box-like repetitive character pattern.".to_string();
        report.at(line, Some(column), &format!("{TODO}#BoxComments"), message);
    }
}

fn line_content(file: &SourceFile, node: Node) -> String {
    let rest = &file.text[node.start_byte() + 2..];
    let end = rest.find('\n').map_or(rest.len(), |at| at + 1);
    rest[..end].to_string()
}

fn starts_without_space(content: &str) -> bool {
    !content.starts_with(' ')
        && !content.starts_with('/')
        && content != "\n"
        && !content.ends_with("//\n")
}
