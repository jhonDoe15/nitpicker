use super::JNode;

#[derive(Debug, Clone)]
pub struct Tok {
    pub kind: Kind,
    pub line: usize,
    pub col: usize,
}

#[derive(Debug, Clone)]
pub enum Kind {
    Newline(String),
    Asterisk(String),
    Char(char),
}

impl Tok {
    pub fn ch(&self) -> Option<char> {
        match self.kind {
            Kind::Char(c) => Some(c),
            _ => None,
        }
    }
    pub fn node(&self) -> JNode {
        match &self.kind {
            Kind::Newline(text) => JNode::leaf("NEWLINE", self, text.clone()),
            Kind::Asterisk(text) => JNode::leaf("LEADING_ASTERISK", self, text.clone()),
            Kind::Char(c) => JNode::leaf("TEXT", self, c.to_string()),
        }
    }
}

pub fn tokens(body: &str, line: usize, col: usize) -> Vec<Tok> {
    let mut toks = Vec::new();
    let mut newline_col = col;
    for (index, text) in body.split('\n').enumerate() {
        let line_no = line + index;
        let mut column = if index == 0 { col } else { 0 };
        let mut rest = text;
        if index > 0 {
            toks.push(Tok {
                kind: Kind::Newline("\n".into()),
                line: line_no - 1,
                col: newline_col,
            });
        }
        let indent = text.len() - text.trim_start_matches([' ', '\t', '\u{c}']).len();
        if text[indent..].starts_with('*') {
            let prefix = &text[..=indent];
            toks.push(Tok {
                kind: Kind::Asterisk(prefix.to_string()),
                line: line_no,
                col: column,
            });
            column += prefix.encode_utf16().count();
            rest = &text[indent + 1..];
        }
        for c in rest.chars() {
            toks.push(Tok {
                kind: Kind::Char(c),
                line: line_no,
                col: column,
            });
            column += c.len_utf16();
        }
        newline_col = column;
    }
    toks
}
