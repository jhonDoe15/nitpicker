use crate::engine::source::SourceFile;
use crate::java::checkstyle::report::Report;
use tree_sitter::Node;

const CONTROL: &[(u32, u32)] = &[
    (0x0000, 0x001F),
    (0x0080, 0x009F),
    (0x00AD, 0x00AD),
    (0x034F, 0x034F),
    (0x070F, 0x070F),
    (0x180E, 0x180E),
    (0x200B, 0x200F),
    (0x202A, 0x202E),
    (0x2060, 0x2064),
    (0x206A, 0x206F),
    (0xFEFF, 0xFEFF),
    (0xFFF9, 0xFFFB),
];

const NON_PRINTABLE: &[(u32, u32)] = &[
    (0x0000, 0x0000),
    (0x0009, 0x0009),
    (0x000B, 0x000C),
    (0x0020, 0x0020),
    (0x007F, 0x007F),
    (0x0085, 0x0085),
    (0x009F, 0x00A0),
    (0x00AD, 0x00AD),
    (0x04F9, 0x04F9),
    (0x05BE, 0x05BE),
    (0x05D0, 0x05D0),
    (0x05EA, 0x05EA),
    (0x05F3, 0x05F4),
    (0x0600, 0x0600),
    (0x0604, 0x0604),
    (0x061C, 0x061C),
    (0x06DD, 0x06DD),
    (0x06FF, 0x06FF),
    (0x070F, 0x070F),
    (0x0750, 0x0750),
    (0x077F, 0x077F),
    (0x0E00, 0x0E00),
    (0x0E7F, 0x0E7F),
    (0x1680, 0x1680),
    (0x180E, 0x180E),
    (0x1E00, 0x1E00),
    (0x2000, 0x200A),
    (0x200F, 0x200F),
    (0x2025, 0x2025),
    (0x2028, 0x2029),
    (0x202F, 0x202F),
    (0x205F, 0x205F),
    (0x2064, 0x2064),
    (0x2066, 0x206A),
    (0x206F, 0x206F),
    (0x20AF, 0x20AF),
    (0x2100, 0x2100),
    (0x213A, 0x213A),
    (0x3000, 0x3000),
    (0xD800, 0xD800),
    (0xF8FF, 0xF8FF),
    (0xFB50, 0xFB50),
    (0xFDFF, 0xFDFF),
    (0xFE70, 0xFE70),
    (0xFEFF, 0xFEFF),
    (0xFF0E, 0xFF0E),
    (0xFF61, 0xFF61),
    (0xFFDC, 0xFFDC),
    (0xFFF9, 0xFFFB),
    (0xFFFF, 0xFFFF),
];

fn all_in(codes: &[u32], ranges: &[(u32, u32)]) -> bool {
    codes
        .iter()
        .all(|code| ranges.iter().any(|(low, high)| low <= code && code <= high))
}

pub fn escapes(text: &str) -> Vec<u32> {
    let bytes = text.as_bytes();
    let mut found = Vec::new();
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] != b'\\' {
            at += 1;
            continue;
        }
        if bytes.get(at + 1) == Some(&b'\\') {
            at += 2;
            continue;
        }
        let mut end = at + 1;
        while bytes.get(end) == Some(&b'u') {
            end += 1;
        }
        let digits = text
            .get(end..end + 4)
            .filter(|hex| hex.bytes().all(|b| b.is_ascii_hexdigit()));
        match (end > at + 1, digits) {
            (true, Some(hex)) => {
                found.push(u32::from_str_radix(hex, 16).unwrap_or(0));
                at = end + 4;
            }
            _ => at += 1,
        }
    }
    found
}

pub fn check(file: &SourceFile, node: Node, comments: &[Node], report: &mut Report) {
    let kind = node.kind();
    if !matches!(kind, "string_literal" | "character_literal") {
        return;
    }
    let text = file.text_of(node);
    illegal_text(node, text, report);
    let codes = escapes(text);
    let flagged = !codes.is_empty() && !all_in(&codes, CONTROL) && !all_in(&codes, NON_PRINTABLE);
    if !flagged || trailing_comment(file, comments, target_line(node)) {
        return;
    }
    let source = "com.puppycrawl.tools.checkstyle.checks.AvoidEscapedUnicodeCharactersCheck";
    let message = "Unicode escape(s) usage should be avoided.".to_string();
    if text.starts_with("\"\"\"") {
        let column = report.unit_column(node) + 3;
        report.at(node.start_position().row + 1, Some(column), source, message);
    } else {
        report.node(node, source, message);
    }
}

fn target_line(node: Node) -> usize {
    let line = |node: Node| node.start_position().row + 1;
    let mut target = line(node);
    let mut current = node;
    while let Some(parent) = current.parent() {
        let operator = match parent.kind() {
            "binary_expression" => parent.child_by_field_name("operator"),
            "method_invocation" | "field_access"
                if parent.child_by_field_name("object") == Some(current) =>
            {
                crate::engine::source::children(parent)
                    .into_iter()
                    .find(|part| part.kind() == ".")
            }
            "ternary_expression" => crate::engine::source::children(parent)
                .into_iter()
                .find(|part| part.kind() == "?"),
            "cast_expression"
            | "parenthesized_expression"
            | "unary_expression"
            | "instanceof_expression" => Some(parent),
            _ => break,
        };
        if let Some(operator) = operator {
            target = target.max(line(operator));
        }
        current = parent;
    }
    target
}

fn trailing_comment(file: &SourceFile, comments: &[Node], line: usize) -> bool {
    let after = comments.partition_point(|comment| comment.start_position().row + 1 <= line);
    let Some(comment) = after.checked_sub(1).map(|at| comments[at]) else {
        return false;
    };
    if comment.start_position().row + 1 != line {
        return false;
    }
    let rest = &file.text[comment.end_byte()..];
    rest[..rest.find('\n').unwrap_or(rest.len())]
        .trim()
        .is_empty()
}

fn illegal_text(node: Node, text: &str, report: &mut Report) {
    static FORMAT: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let format = FORMAT.get_or_init(|| {
        regex::Regex::new(
            r"\\u00(08|09|0(a|A)|0(c|C)|0(d|D)|20|22|27|5(C|c))|\\(0(10|11|12|14|15|40|42|47)|134)",
        )
        .expect("format")
    });
    if !format.is_match(text) {
        return;
    }
    let source = "com.puppycrawl.tools.checkstyle.checks.coding.IllegalTokenTextCheck";
    let message =
        "Consider using special escape sequence instead of octal value or Unicode escaped value."
            .to_string();
    let block = text.starts_with("\"\"\"");
    let column = report.unit_column(node) + if block { 3 } else { 0 };
    report.at(node.start_position().row + 1, Some(column), source, message);
}
