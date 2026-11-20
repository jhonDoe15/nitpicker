//! Doc comments, read the way the Documentation Comment Specification for the Standard Doclet describes them:
//! a main description, then block tags, with inline tags, HTML and entities inside. Where the specification is
//! silent (how a malformed part is reported and where reading resumes), the trees follow what javac 21 gives for
//! the comments in `tests/fixtures/doctrees`, recorded in `tests/expected/doctrees.txt`.
use super::docparse::Parser;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Text,
    Entity,
    Escape,
    StartElement,
    EndElement,
    Attribute,
    Comment,
    DocType,
    Identifier,
    Reference,
    Block,
    UnknownBlock,
    Inline,
    UnknownInline,
    Erroneous,
}

/// One part of a doc comment. Positions count characters of the comment text; `Comment::source_pos` gives the file offset.
pub struct Tree {
    pub kind: Kind,
    /// The tag, element, attribute or entity name, the identifier, the reference, or the text of an erroneous part.
    pub name: String,
    pub pos: usize,
    pub end: usize,
    /// Why an erroneous part is one, as javac's diagnostic key without `compiler.err.`; empty otherwise.
    pub code: &'static str,
    pub children: Vec<Tree>,
    /// The child the description of a tag starts at.
    pub described: usize,
}

impl Tree {
    pub fn leaf(kind: Kind, name: String, pos: usize, end: usize) -> Tree {
        Tree { kind, name, pos, end, code: "", children: Vec::new(), described: 0 }
    }
    pub fn text(pos: usize, end: usize) -> Tree {
        Tree::leaf(Kind::Text, String::new(), pos, end)
    }
    pub fn erroneous(name: String, pos: usize, end: usize, code: &'static str) -> Tree {
        Tree { code, ..Tree::leaf(Kind::Erroneous, name, pos, end) }
    }
    /// What follows the name or reference of a tag: the text of `@param x text`, all of `@return text`.
    pub fn description(&self) -> &[Tree] {
        self.children.get(self.described..).unwrap_or_default()
    }
    /// A tag that can stand at the start of a line; `{@return}` is the one inline tag that also can.
    pub fn is_block_tag(&self) -> bool {
        matches!(self.kind, Kind::Block | Kind::UnknownBlock) || (self.kind == Kind::Inline && self.name == "return")
    }
    pub fn end_position(&self) -> usize {
        self.end
    }
    fn visit(&self, parent: Option<&Tree>, visitor: &mut dyn FnMut(&Tree, Option<&Tree>)) {
        visitor(self, parent);
        for child in &self.children {
            child.visit(Some(self), visitor);
        }
    }
}

pub struct DocComment {
    /// The main description.
    pub body: Vec<Tree>,
    /// The block tags, and what could not be read as one.
    pub tags: Vec<Tree>,
    /// The file offset javac gives the comment: its first part, or a place in its blank lines, or none when it is empty.
    pub start: Option<usize>,
}

impl DocComment {
    /// Every part with the part it is in, parents before children, in the order of the text.
    pub fn visit(&self, visitor: &mut dyn FnMut(&Tree, Option<&Tree>)) {
        for tree in self.body.iter().chain(&self.tags) {
            tree.visit(None, visitor);
        }
    }
}

/// Whitespace as `Character.isWhitespace` has it: no-break spaces are not.
pub fn is_space(character: char) -> bool {
    matches!(character, '\u{1c}'..='\u{1f}') || (character.is_whitespace() && !matches!(character, '\u{a0}' | '\u{2007}' | '\u{202f}' | '\u{85}'))
}

/// The text of a doc comment without its delimiters and without the leading asterisks of its lines.
pub struct Comment {
    pub text: Vec<char>,
    offsets: Vec<usize>,
    /// Where the text ends, and where the spaces after it end: an inline tag left open runs up to there.
    end: usize,
    limit: usize,
}

type Decoded = Vec<(char, usize)>;

/// The characters of the comment after Unicode escapes are translated, each with the file offset it starts at.
/// A backslash and `u` that fewer than four hexadecimal digits follow are dropped with those digits, as javac drops them.
fn decode(raw: &str, start: usize) -> Decoded {
    let source: Vec<(usize, char)> = raw.char_indices().collect();
    let mut out: Decoded = Vec::with_capacity(source.len());
    let mut slashes = 0usize;
    let mut at = 0usize;
    while at < source.len() {
        let (offset, character) = source[at];
        if character != '\\' {
            slashes = 0;
            out.push((character, start + offset));
            at += 1;
            continue;
        }
        if slashes % 2 == 1 || source.get(at + 1).map(|next| next.1) != Some('u') {
            slashes += 1;
            out.push((character, start + offset));
            at += 1;
            continue;
        }
        slashes = 0;
        at += 1;
        while source.get(at).map(|next| next.1) == Some('u') {
            at += 1;
        }
        let digits: String = source[at..].iter().take(4).map(|next| next.1).take_while(char::is_ascii_hexdigit).collect();
        at += digits.len();
        if digits.len() == 4 {
            let unit = u32::from_str_radix(&digits, 16).unwrap_or(0xfffd);
            out.push((char::from_u32(unit).unwrap_or('\u{fffd}'), start + offset));
        }
    }
    out
}

impl Comment {
    /// Reads `/** ... */` as written at file offset `start`; none when it is not a doc comment.
    pub fn of(raw: &str, start: usize) -> Option<Comment> {
        if raw.len() < 5 || !raw.starts_with("/**") || !raw.ends_with("*/") {
            return None;
        }
        let decoded = decode(raw, start);
        let close = decoded.len().checked_sub(2).filter(|close| *close >= 3)?;
        let mut comment = Comment { text: Vec::new(), offsets: Vec::new(), end: decoded[close].1, limit: decoded[close].1 };
        let mut from = 3usize;
        let mut first = true;
        while from <= close {
            let mut to = from;
            while to < close && !matches!(decoded[to].0, '\n' | '\r') {
                to += 1;
            }
            let last = to == close;
            comment.line(&decoded, from, to, first, last);
            from = if !last && decoded[to].0 == '\r' && to + 1 < close && decoded[to + 1].0 == '\n' { to + 2 } else { to + 1 };
            first = false;
        }
        Some(comment)
    }

    /// Adds the line `decoded[from..to]`: spaces and asterisks before its text go, a line without an asterisk keeps
    /// its indentation, a blank first line goes entirely, and the last line loses the asterisks and spaces before `*/`
    /// (all of it when it holds nothing else).
    fn line(&mut self, decoded: &Decoded, from: usize, to: usize, first: bool, last: bool) {
        let mut to_text = to;
        if last {
            while to_text > from && decoded[to_text - 1].0 == '*' {
                to_text -= 1;
            }
        }
        let mut begin = from;
        while first && begin < to_text && decoded[begin].0 == '*' {
            begin += 1;
        }
        while begin < to_text && is_space(decoded[begin].0) {
            begin += 1;
        }
        let starred = begin < to_text && decoded[begin].0 == '*';
        while begin < to_text && decoded[begin].0 == '*' {
            begin += 1;
        }
        let blank = !starred && begin == to_text;
        if !starred && !blank && !first {
            begin = from;
        }
        if last {
            if decoded[begin..to_text].iter().all(|(character, _)| *character == '*' || is_space(*character)) {
                begin = to_text;
            }
            self.limit = decoded[to_text].1;
            while to_text > begin && is_space(decoded[to_text - 1].0) {
                to_text -= 1;
            }
            self.end = decoded[to_text].1;
        }
        for (character, offset) in &decoded[begin..to_text] {
            self.text.push(*character);
            self.offsets.push(*offset);
        }
        if !last && !(first && blank) {
            self.text.push('\n');
            self.offsets.push(decoded[to].1);
        }
    }

    /// The file offset of a position in the text. The position after the last character is where the text ends.
    /// javac counts one past it for text that ends in a lone `{`, and gives an inline tag left open the place where
    /// the comment's closing delimiter starts: that is the position two past the end here.
    pub fn source_pos(&self, pos: usize) -> Option<usize> {
        match pos.checked_sub(self.text.len()) {
            None => Some(self.offsets[pos]),
            Some(0) => Some(self.end),
            Some(1) => Some(self.end + 1),
            Some(2) => Some(self.limit),
            Some(_) => None,
        }
    }
}

pub fn parse(comment: &Comment) -> DocComment {
    let mut parser = Parser::new(&comment.text);
    parser.skip_space();
    let body = parser.description();
    let tags = parser.block_tags();
    let start = match body.first().or(tags.first()) {
        Some(first) => comment.source_pos(first.pos),
        None if comment.text.is_empty() => None,
        None => comment.source_pos(1).map(|offset| offset.saturating_sub(1)),
    };
    DocComment { body, tags, start }
}
