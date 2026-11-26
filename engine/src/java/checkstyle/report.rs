use crate::engine::finding::Finding;
use crate::engine::source::SourceFile;

pub const JAVADOC: &str = "com.puppycrawl.tools.checkstyle.checks.javadoc.";

/// Collects findings of one file the way Checkstyle writes them: a column is 1-based with tabs expanded to 8,
/// 0 means the finding has no column, and equal findings are reported once.
pub struct Report<'f> {
    file: &'f SourceFile,
    lines: Vec<&'f str>,
    pub findings: Vec<Finding>,
}

impl<'f> Report<'f> {
    pub fn new(file: &'f SourceFile) -> Self {
        Report {
            file,
            lines: file.text.split('\n').collect(),
            findings: Vec::new(),
        }
    }

    pub fn line_text(&self, line: usize) -> &'f str {
        self.lines.get(line.wrapping_sub(1)).copied().unwrap_or("")
    }

    /// Expanded 1-based column of a 0-based UTF-16 column on a 1-based line.
    pub fn column(&self, line: usize, col: usize) -> usize {
        expanded(self.line_text(line), col) + 1
    }

    pub fn at(&mut self, line: usize, col: Option<usize>, source: &str, message: String) {
        let column = col.map_or(0, |col| self.column(line, col));
        self.push(line, column, source, message);
    }

    pub fn node(&mut self, node: tree_sitter::Node, source: &str, message: String) {
        let units = self.unit_column(node);
        self.at(node.start_position().row + 1, Some(units), source, message);
    }

    /// 0-based UTF-16 column where a node starts.
    pub fn unit_column(&self, node: tree_sitter::Node) -> usize {
        let text = self.line_text(node.start_position().row + 1);
        let byte = node.start_position().column.min(text.len());
        text.get(..byte)
            .map_or(byte, |prefix| prefix.encode_utf16().count())
    }

    pub fn push(&mut self, line: usize, column: usize, source: &str, message: String) {
        self.findings.push(Finding {
            file: self.file.path.clone(),
            line,
            column,
            rule: source.to_string(),
            message,
            symbol: None,
            priority: None,
            arguments: None,
        });
    }
}

/// Width of the first `col` UTF-16 units of a line with tabs expanded to multiples of 8.
pub fn expanded(line: &str, col: usize) -> usize {
    let mut width = 0;
    let mut units = 0;
    for c in line.chars() {
        if units >= col {
            break;
        }
        width = if c == '\t' {
            (width / 8 + 1) * 8
        } else {
            width + 1
        };
        units += c.len_utf16();
    }
    width + col.saturating_sub(units)
}

/// A number as Checkstyle's messages print it, with a comma between groups of three digits.
pub fn grouped(number: usize) -> String {
    let digits = number.to_string();
    let mut out = String::new();
    for (at, digit) in digits.chars().enumerate() {
        if at > 0 && (digits.len() - at) % 3 == 0 {
            out.push(',');
        }
        out.push(digit);
    }
    out
}
