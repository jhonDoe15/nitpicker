mod html;
mod inline;
mod tags;
mod text;
mod tokens;

pub use tokens::Tok;

#[derive(Debug, Clone)]
pub struct JNode {
    pub kind: &'static str,
    pub line: usize,
    pub col: usize,
    pub text: String,
    pub children: Vec<JNode>,
}

impl JNode {
    pub fn leaf(kind: &'static str, tok: &Tok, text: String) -> JNode {
        JNode {
            kind,
            line: tok.line,
            col: tok.col,
            text,
            children: Vec::new(),
        }
    }
    pub fn branch(kind: &'static str, children: Vec<JNode>) -> JNode {
        let (line, col) = children
            .first()
            .map_or((0, 0), |first| (first.line, first.col));
        JNode {
            kind,
            line,
            col,
            text: kind.to_string(),
            children,
        }
    }
    pub fn first(&self, kind: &str) -> Option<&JNode> {
        self.children.iter().find(|child| child.kind == kind)
    }
    pub fn visit<'a>(&'a self, out: &mut impl FnMut(&'a JNode)) {
        out(self);
        for child in &self.children {
            child.visit(out);
        }
    }
}

pub struct Parsed {
    pub root: JNode,
}

pub type Result<T> = std::result::Result<T, ()>;

pub fn parse(body: &str, line: usize, col: usize) -> Result<Parsed> {
    let toks = tokens::tokens(body, line, col);
    let mut parser = Parser {
        toks: &toks,
        elements: Default::default(),
        inline: Default::default(),
    };
    let children = parser.javadoc()?;
    let mut root = JNode::branch("JAVADOC_CONTENT", children);
    root.line = line;
    root.col = col;
    Ok(Parsed { root })
}

pub type Element = (JNode, Vec<JNode>, usize);

pub struct Parser<'t> {
    pub toks: &'t [Tok],
    pub elements: std::cell::RefCell<std::collections::HashMap<usize, Result<Element>>>,
    pub inline: std::cell::Cell<usize>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Stop {
    Block,
    Element,
}

impl Parser<'_> {
    pub fn ch(&self, at: usize) -> Option<char> {
        self.toks.get(at).and_then(Tok::ch)
    }
    pub fn is_space(&self, at: usize) -> bool {
        matches!(self.ch(at), Some(' ' | '\t' | '\u{c}'))
    }
    pub fn line_start(&self, at: usize) -> bool {
        let mut index = at;
        while index > 0 {
            index -= 1;
            match &self.toks[index] {
                tok if tok.ch().is_some_and(|c| matches!(c, ' ' | '\t' | '\u{c}')) => {}
                tok if tok.ch().is_some() => return false,
                _ => return true,
            }
        }
        true
    }
    pub fn block_tag_at(&self, at: usize) -> bool {
        self.ch(at) == Some('@') && self.line_start(at)
    }

    fn javadoc(&mut self) -> Result<Vec<JNode>> {
        let (mut nodes, mut at) = self.content(0, Stop::Block)?;
        while at < self.toks.len() {
            if !self.block_tag_at(at) {
                return Err(());
            }
            let (tag, trailing, next) = self.block_tag(at)?;
            nodes.push(tag);
            nodes.extend(trailing);
            at = next;
        }
        Ok(nodes)
    }

    pub fn content(&self, mut at: usize, stop: Stop) -> Result<(Vec<JNode>, usize)> {
        let mut nodes = Vec::new();
        let mut text: Option<JNode> = None;
        while at < self.toks.len() {
            let tok = &self.toks[at];
            match tok.ch() {
                None => {
                    flush(&mut text, &mut nodes);
                    nodes.push(tok.node());
                    at += 1;
                }
                Some('@') if self.block_tag_at(at) => break,
                Some('}') if self.inline.get() > 0 => break,
                Some('{') if self.ch(at + 1) == Some('@') => {
                    flush(&mut text, &mut nodes);
                    let (node, next) = self.inline_tag(at)?;
                    nodes.push(node);
                    at = next;
                }
                Some('<') if self.end_tag_at(at) => {
                    if stop == Stop::Block {
                        return Err(());
                    }
                    break;
                }
                Some('<') if self.comment_at(at) => {
                    flush(&mut text, &mut nodes);
                    let (node, next) = self.html_comment(at)?;
                    nodes.push(node);
                    at = next;
                }
                Some('<') if self.start_tag_at(at) => {
                    flush(&mut text, &mut nodes);
                    let (element, trailing, next) = self.element(at)?;
                    nodes.push(element);
                    nodes.extend(trailing);
                    at = next;
                }
                Some(c) => {
                    push_char(&mut text, tok, c);
                    at += 1;
                }
            }
        }
        flush(&mut text, &mut nodes);
        Ok((nodes, at))
    }
}

pub fn push_char(text: &mut Option<JNode>, tok: &Tok, c: char) {
    match text {
        Some(node) => node.text.push(c),
        None => *text = Some(JNode::leaf("TEXT", tok, c.to_string())),
    }
}

pub fn flush(text: &mut Option<JNode>, nodes: &mut Vec<JNode>) {
    if let Some(node) = text.take() {
        nodes.push(node);
    }
}

pub fn blank(node: &JNode) -> bool {
    match node.kind {
        "NEWLINE" | "LEADING_ASTERISK" => true,
        "TEXT" => node.text.chars().all(|c| matches!(c, ' ' | '\t' | '\u{c}')),
        _ => false,
    }
}

/// Splits content into what stays outside the wrapper before it, the wrapped part, and what follows it.
pub fn trimmed(mut nodes: Vec<JNode>) -> (Vec<JNode>, Vec<JNode>, Vec<JNode>) {
    let lead = nodes.iter().take_while(|node| blank(node)).count();
    let rest = nodes.split_off(lead);
    let mut middle = rest;
    let keep = middle
        .iter()
        .rposition(|node| !blank(node))
        .map_or(0, |index| index + 1);
    let tail = middle.split_off(keep);
    (nodes, middle, tail)
}
