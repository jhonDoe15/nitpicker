//! Descriptions: text, entities, HTML and inline tags, up to the next block tag, closing brace or closing quote.
use super::doc::{Kind, Tree, is_space};

/// Where a description ends.
#[derive(Clone, Copy, PartialEq)]
pub enum Until {
    /// At an `@` that starts a line, or the end of the comment.
    BlockTag,
    /// At the `}` that closes the inline tag the description is in.
    Brace,
    /// At the quote that closes an attribute value.
    Quote(char),
}

pub struct Parser<'c> {
    pub text: &'c [char],
    pub at: usize,
    /// Only whitespace since the last line break: an `@` here starts a block tag.
    pub line_start: bool,
}

pub fn name_start(character: char) -> bool {
    character.is_alphabetic()
}

pub fn name_part(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}

pub fn java_start(character: char) -> bool {
    character.is_alphabetic() || matches!(character, '_' | '$')
}

pub fn java_part(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '_' | '$')
}

impl<'c> Parser<'c> {
    pub fn new(text: &'c [char]) -> Parser<'c> {
        Parser { text, at: 0, line_start: true }
    }

    pub fn peek(&self) -> Option<char> {
        self.text.get(self.at).copied()
    }

    pub fn ahead(&self, by: usize) -> Option<char> {
        self.text.get(self.at + by).copied()
    }

    pub fn slice(&self, from: usize, to: usize) -> String {
        self.text[from..to].iter().collect()
    }

    pub fn skip_space(&mut self) {
        while let Some(character) = self.peek().filter(|character| is_space(*character)) {
            self.line_start |= character == '\n';
            self.at += 1;
        }
    }

    /// Reads a name whose first character passes `start` and the rest `part`.
    pub fn word(&mut self, start: fn(char) -> bool, part: fn(char) -> bool) -> Option<String> {
        let from = self.at;
        if !self.peek().is_some_and(start) {
            return None;
        }
        while self.peek().is_some_and(part) {
            self.at += 1;
        }
        Some(self.slice(from, self.at))
    }

    /// The end of `from..to` without trailing whitespace.
    pub fn trimmed(&self, from: usize, to: usize) -> usize {
        let mut end = to.min(self.text.len());
        while end > from && is_space(self.text[end - 1]) {
            end -= 1;
        }
        end
    }

    /// What was read from `from` up to here, given up on for the reason `code`. Reading goes on from here.
    pub fn erroneous(&mut self, from: usize, code: &'static str) -> Tree {
        let end = self.trimmed(from, self.at);
        let mut back = self.at;
        while back > 0 && is_space(self.text[back - 1]) && self.text[back - 1] != '\n' {
            back -= 1;
        }
        self.line_start = back == 0 || self.text[back - 1] == '\n';
        Tree::erroneous(self.slice(from, end), from, end, code)
    }

    /// A description up to the next block tag, without the whitespace at its end.
    pub fn description(&mut self) -> Vec<Tree> {
        self.content(Until::BlockTag).0
    }

    /// The parts of a description, and whether its end was found.
    pub fn content(&mut self, until: Until) -> (Vec<Tree>, bool) {
        let mut out: Vec<Tree> = Vec::new();
        let mut from: Option<usize> = None;
        let mut solid: Option<usize> = None;
        let mut depth = 1usize;
        let mut closed = until == Until::BlockTag;
        let mut wrapped = false;
        while let Some(character) = self.peek() {
            let tagged = self.ahead(1) == Some('@');
            match character {
                '@' if wrapped && matches!(until, Until::Quote(_)) => break,
                '\n' => {
                    wrapped = true;
                    self.line_start = true;
                    from.get_or_insert(self.at);
                    self.at += 1;
                }
                other if is_space(other) => {
                    from.get_or_insert(self.at);
                    self.at += 1;
                }
                '@' if self.ahead(1) == Some('@') && self.at > 0 && self.text[self.at - 1] == '{' => {
                    out.extend(from.take().map(|start| Tree::text(start, self.at)));
                    out.push(Tree::leaf(Kind::Escape, "@@".to_string(), self.at, self.at + 2));
                    self.at += 2;
                    self.skip_space();
                }
                '@' if self.line_start && matches!(self.ahead(1), Some('@' | '*')) => {
                    out.extend(from.take().map(|start| Tree::text(start, self.at)));
                    out.push(Tree::leaf(Kind::Escape, self.slice(self.at, self.at + 2), self.at, self.at + 2));
                    self.at += 2;
                    self.line_start = false;
                }
                '@' if self.line_start && until != Until::Brace => break,
                '@' if self.ahead(1) == Some('/') && self.at > 0 && self.text[self.at - 1] == '*' => {
                    out.extend(from.take().map(|start| Tree::text(start, self.at)));
                    out.push(Tree::leaf(Kind::Escape, "@/".to_string(), self.at, self.at + 2));
                    self.at += 2;
                }
                '&' => {
                    out.extend(from.take().map(|start| Tree::text(start, self.at)));
                    out.push(self.entity());
                    self.line_start = false;
                }
                '<' if !matches!(until, Until::Quote(_)) => {
                    out.extend(from.take().map(|start| Tree::text(start, self.at)));
                    out.push(self.markup());
                    self.line_start = false;
                }
                '{' if tagged && self.ahead(2) != Some('@') => {
                    out.extend(from.take().map(|start| Tree::text(start, self.at)));
                    out.push(self.inline_tag());
                }
                '}' if until == Until::Brace && depth == 1 => {
                    out.extend(from.take().map(|start| Tree::text(start, self.at)));
                    self.at += 1;
                    self.line_start = false;
                    closed = true;
                    break;
                }
                quote if until == Until::Quote(quote) => {
                    out.extend(from.take().map(|start| Tree::text(start, self.at)));
                    closed = true;
                    break;
                }
                other => {
                    self.line_start = false;
                    from.get_or_insert(self.at);
                    solid = Some(self.at);
                    self.at += 1;
                    if other == '{' {
                        depth += usize::from(until == Until::Brace);
                        solid = Some(self.at);
                    } else if other == '}' && until == Until::Brace {
                        depth -= 1;
                    }
                }
            }
        }
        if until == Until::BlockTag {
            if let (Some(start), Some(last)) = (from, solid) {
                if last >= start {
                    out.push(Tree::text(start, last + 1));
                }
            }
        }
        (out, closed)
    }

    /// `&name;`, `&#12;` or `&#x1f;`.
    fn entity(&mut self) -> Tree {
        let from = self.at;
        self.at += 1;
        let named = if self.peek() == Some('#') {
            self.at += 1;
            let hexadecimal = matches!(self.peek(), Some('x' | 'X'));
            self.at += usize::from(hexadecimal);
            let digits = self.at;
            while self.peek().is_some_and(|digit| if hexadecimal { digit.is_ascii_hexdigit() } else { digit.is_ascii_digit() }) {
                self.at += 1;
            }
            self.at > digits
        } else {
            self.word(name_start, name_part).is_some()
        };
        if !named {
            return Tree::erroneous(self.slice(from, self.at), from, self.at, "dc.bad.entity");
        }
        if self.peek() != Some(';') {
            return Tree::erroneous(self.slice(from, self.at), from, self.at, "dc.missing.semicolon");
        }
        self.at += 1;
        Tree::leaf(Kind::Entity, self.slice(from + 1, self.at - 1), from, self.at)
    }

    /// An element, an end tag or an HTML comment; a `<` that starts none of them is erroneous on its own.
    fn markup(&mut self) -> Tree {
        let from = self.at;
        if let Some(tree) = self.element(from) {
            return tree;
        }
        self.at = from + 1;
        Tree::erroneous("<".to_string(), from, from + 1, "dc.malformed.html")
    }

    fn element(&mut self, from: usize) -> Option<Tree> {
        self.at = from + 1;
        match self.peek()? {
            first if name_start(first) => {
                let name = self.word(name_start, name_part)?;
                let children = self.attributes(false).ok()?;
                self.at += usize::from(self.peek() == Some('/'));
                if self.peek() != Some('>') {
                    return None;
                }
                self.at += 1;
                Some(Tree { children, ..Tree::leaf(Kind::StartElement, name, from, self.at) })
            }
            '/' => {
                self.at += 1;
                let name = self.word(name_start, name_part)?;
                self.skip_space();
                if self.peek() != Some('>') {
                    return None;
                }
                self.at += 1;
                Some(Tree::leaf(Kind::EndElement, name, from, self.at))
            }
            '!' if self.ahead(1) == Some('-') && self.ahead(2) == Some('-') => {
                let close = (from + 4..self.text.len().saturating_sub(2)).find(|at| self.text[*at..*at + 3] == ['-', '-', '>'])?;
                self.at = close + 3;
                Some(Tree::leaf(Kind::Comment, self.slice(from, self.at), from, self.at))
            }
            '!' if self.ahead(1) == Some('-') => None,
            '!' => {
                let word: String = self.text[from + 2..].iter().take(7).collect();
                if word.eq_ignore_ascii_case("doctype") {
                    let close = (from..self.text.len()).find(|at| self.text[*at] == '>')?;
                    self.at = from + 9;
                    self.skip_space();
                    let named = self.at.min(close);
                    self.at = close + 1;
                    return Some(Tree::leaf(Kind::DocType, self.slice(named, close), named, self.at));
                }
                self.at = from + 2;
                Some(Tree::erroneous("<!".to_string(), from, self.at, "dc.invalid.html"))
            }
            _ => None,
        }
    }

    /// The attributes of an element or of `{@snippet}`: `name`, `name=value`, `name="value"`, `name='value'`.
    /// Inside a snippet a value is plain text and an unquoted one also ends at `}` or `:`.
    pub fn attributes(&mut self, snippet: bool) -> Result<Vec<Tree>, &'static str> {
        let mut out = Vec::new();
        loop {
            self.skip_space();
            let from = self.at;
            let Some(name) = self.word(name_start, |part| name_part(part) || part == '-') else { return Ok(out) };
            let mut attribute = Tree::leaf(Kind::Attribute, name, from, self.at);
            let named = (self.at, self.line_start);
            self.skip_space();
            if self.peek() != Some('=') {
                (self.at, self.line_start) = named;
                out.push(attribute);
                continue;
            }
            self.at += 1;
            self.skip_space();
            match self.peek() {
                Some(quote @ ('"' | '\'')) => {
                    self.at += 1;
                    let value = self.at;
                    if snippet {
                        while self.peek().is_some_and(|character| character != quote) {
                            self.at += 1;
                        }
                        if self.at > value {
                            attribute.children.push(Tree::text(value, self.at));
                        }
                    } else {
                        attribute.children = self.content(Until::Quote(quote)).0;
                    }
                    if self.peek() != Some(quote) {
                        return Err("dc.no.content");
                    }
                    self.at += 1;
                }
                _ => {
                    let value = self.at;
                    while let Some(character) = self.peek() {
                        if is_space(character) || character == '>' || (snippet && matches!(character, '}' | ':')) {
                            break;
                        }
                        if !snippet && matches!(character, '"' | '\'' | '<' | '=' | '`') {
                            return Err("dc.malformed.html");
                        }
                        self.at += 1;
                    }
                    if self.at > value {
                        attribute.children.push(Tree::text(value, self.at));
                    }
                }
            }
            attribute.end = self.at;
            out.push(attribute);
        }
    }
}
