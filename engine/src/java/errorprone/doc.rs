//! The text of a doc comment and its tree, as javac's `JavadocTokenizer` and `DocCommentParser` (JDK 21) make them:
//! same nodes, same positions, same recovery from malformed input.

const EOI: char = '\u{1A}';

/// The text of a `/** */` comment without its frame, and where each character sits in the file.
pub struct Comment {
    pub text: Vec<char>,
    map: Vec<(usize, usize)>,
}

impl Comment {
    /// `raw` is the whole comment, `start` its byte offset in the file. `None` when it is not a doc comment.
    pub fn of(raw: &str, start: usize) -> Option<Comment> {
        let mut letters: Vec<(char, usize)> = raw.char_indices().map(|(at, letter)| (letter, start + at)).collect();
        let count = letters.len();
        letters.push((EOI, start + raw.len()));
        let is = |at: usize, wanted: char| at < count && letters[at].0 == wanted;
        let blank = |at: usize| at < count && matches!(letters[at].0, ' ' | '\t' | '\u{c}');
        if !raw.starts_with("/**") || raw.starts_with("/**/") {
            return None;
        }
        let mut comment = Comment { text: Vec::new(), map: Vec::new() };
        let mut at = 3;
        let stars = (at..count).take_while(|place| letters[*place].0 == '*').count();
        at += stars;
        if stars != 0 && is(at, '/') {
            return Some(comment);
        }
        while blank(at) {
            at += 1;
        }
        if is(at, '\r') || is(at, '\n') {
            at += usize::from(is(at, '\r'));
            at += usize::from(is(at, '\n'));
        }
        let mut first = true;
        while at < count {
            let from = at;
            while at < count && !matches!(letters[at].0, '\r' | '\n') {
                at += 1;
            }
            let to = at;
            at += usize::from(is(at, '\r'));
            at += usize::from(is(at, '\n'));
            let (mut from, to) = Self::without_end(&letters, from, to);
            let mut place = from;
            while place < to && matches!(letters[place].0, ' ' | '\t' | '\u{c}') {
                place += 1;
            }
            if place == to {
                from = to;
            } else {
                let after = (place..to).find(|star| letters[*star].0 != '*').unwrap_or(to);
                if after > place {
                    from = after;
                }
            }
            if first {
                first = false;
            } else {
                comment.text.push('\n');
                comment.map.push((comment.text.len(), letters[from].1));
            }
            for (letter, offset) in &letters[from..to] {
                comment.map.push((comment.text.len(), *offset));
                comment.text.push(*letter);
            }
        }
        Some(comment)
    }

    /// `trimEndOfComment`: the line without a closing `*/` and the stars before it.
    fn without_end(letters: &[(char, usize)], from: usize, to: usize) -> (usize, usize) {
        let mut at = from;
        let mut blank = true;
        while at < to {
            let before = at;
            while at < to && letters[at].0 == '*' {
                at += 1;
            }
            if at > before && at < to && letters[at].0 == '/' {
                return (if blank { before } else { from }, before);
            }
            if at < to {
                blank &= matches!(letters[at].0, ' ' | '\t' | '\u{c}');
                at += 1;
            } else {
                blank = false;
            }
        }
        (from, to)
    }

    /// Where a place in the text is in the file; `None` for a comment without any text.
    pub fn source_pos(&self, pos: usize) -> Option<usize> {
        let first = self.map.first()?;
        let at = self.map.partition_point(|(text, _)| *text <= pos);
        let (text, offset) = if at == 0 { *first } else { self.map[at - 1] };
        Some((offset as isize + pos as isize - text as isize).max(0) as usize)
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Text,
    Entity,
    StartElement,
    EndElement,
    HtmlComment,
    DocType,
    Escape,
    Erroneous,
    Inline,
    UnknownInline,
    Block,
    UnknownBlock,
    Reference,
    Identifier,
    Attribute,
}

#[derive(Debug)]
pub struct Tree {
    pub kind: Kind,
    pub pos: usize,
    /// The end, for the nodes javac gives one explicitly.
    pub end: Option<usize>,
    /// Tag, element, entity or attribute name; the text of a text node; the body of an erroneous one.
    pub name: String,
    /// For an erroneous node, javac's message key.
    pub code: &'static str,
    pub children: Vec<Tree>,
    /// For a block tag: how many of the first children are its reference or name, not its description.
    pub lead: usize,
    /// `@param <T>`.
    pub type_parameter: bool,
}

impl Tree {
    fn new(kind: Kind, pos: isize, name: impl Into<String>) -> Tree {
        Tree { kind, pos: pos.max(0) as usize, end: None, name: name.into(), code: "", children: Vec::new(), lead: 0, type_parameter: false }
    }
    fn with(mut self, children: Vec<Tree>) -> Tree {
        self.children = children;
        self
    }
    fn ending(mut self, end: isize) -> Tree {
        self.end = Some(end.max(0) as usize);
        self
    }
    /// A block tag, or `{@return}`, which javac counts as one.
    pub fn is_block_tag(&self) -> bool {
        matches!(self.kind, Kind::Block | Kind::UnknownBlock) || (self.kind == Kind::Inline && self.name == "return")
    }
    pub fn description(&self) -> &[Tree] {
        &self.children[self.lead.min(self.children.len())..]
    }
    /// `DCTree.getEndPosition`.
    pub fn end_position(&self) -> usize {
        if let Some(end) = self.end {
            return end;
        }
        let length = self.name.chars().count();
        match self.kind {
            Kind::Text | Kind::Erroneous | Kind::Identifier | Kind::HtmlComment => self.pos + length,
            Kind::Escape => self.pos + 2,
            Kind::Entity => self.pos + length + 2,
            Kind::Block | Kind::UnknownBlock if !matches!(self.name.as_str(), "exception" | "spec") => match self.children.last() {
                Some(last) => last.end_position() + usize::from(self.type_parameter && self.description().is_empty()),
                None => self.pos + length + 1,
            },
            _ => self.children.last().map_or(self.pos, Tree::end_position),
        }
    }
    /// Every node under this one and the node itself, in the order javac's scanner visits them.
    pub fn visit<'t>(&'t self, each: &mut dyn FnMut(&'t Tree)) {
        each(self);
        for child in &self.children {
            child.visit(each);
        }
    }
}

pub struct DocComment {
    pub body: Vec<Tree>,
    pub tags: Vec<Tree>,
    /// `DCDocComment.pos`: the first node of the body, else the first block tag, else zero.
    pub pos: usize,
}

impl DocComment {
    pub fn visit<'t>(&'t self, each: &mut dyn FnMut(&'t Tree)) {
        for tree in self.body.iter().chain(&self.tags) {
            tree.visit(each);
        }
    }
}

pub fn parse(comment: &Comment) -> DocComment {
    let mut parser = Parser { buf: &comment.text, bp: -1, ch: EOI, newline: true, text_start: -1, last_non_white: -1 };
    parser.next_char();
    let body = parser.block_content();
    let tags = parser.block_tags();
    let pos = body.first().or(tags.first()).map_or(0, |first| first.pos);
    DocComment { body, tags, pos }
}

#[derive(Clone, Copy, PartialEq)]
enum Place {
    Inline,
    Block,
    Either,
}

#[derive(Clone, Copy, PartialEq)]
enum Member {
    Required,
    Optional,
    Disallowed,
}

#[derive(Clone, Copy, PartialEq)]
enum Keep {
    All,
    NotFirstSpace,
    Nothing,
}

type Parsed<T> = Result<T, &'static str>;

fn tag_place(name: &str) -> Option<(Place, bool)> {
    Some(match name {
        "author" | "deprecated" | "exception" | "hidden" | "param" | "provides" | "see" | "serialData" | "serialField" | "serial" | "since"
        | "spec" | "throws" | "uses" | "version" => (Place::Block, false),
        "code" | "literal" => (Place::Inline, true),
        "docRoot" | "index" | "inheritDoc" | "link" | "linkplain" | "snippet" | "summary" | "systemProperty" | "value" => (Place::Inline, false),
        "return" => (Place::Either, false),
        _ => return None,
    })
}

fn identifier_start(letter: char) -> bool {
    letter.is_alphabetic()
}

fn identifier_part(letter: char) -> bool {
    letter.is_alphanumeric() || letter == '_'
}

fn java_start(letter: char) -> bool {
    letter.is_alphabetic() || matches!(letter, '_' | '$')
}

fn java_part(letter: char) -> bool {
    letter.is_alphanumeric() || matches!(letter, '_' | '$')
}

fn whitespace(letter: char) -> bool {
    (letter.is_whitespace() && !matches!(letter, '\u{a0}' | '\u{2007}' | '\u{202f}')) || ('\u{1c}'..='\u{1f}').contains(&letter)
}

struct Parser<'a> {
    buf: &'a [char],
    bp: isize,
    ch: char,
    newline: bool,
    text_start: isize,
    last_non_white: isize,
}

impl Parser<'_> {
    fn length(&self) -> isize {
        self.buf.len() as isize
    }
    fn at(&self, place: isize) -> char {
        if place < 0 { EOI } else { self.buf.get(place as usize).copied().unwrap_or(EOI) }
    }
    fn more(&self) -> bool {
        self.bp < self.length()
    }
    fn next_char(&mut self) {
        if self.bp < self.length() {
            self.bp += 1;
        }
        self.ch = self.at(self.bp);
        if matches!(self.ch, '\u{c}' | '\n' | '\r') {
            self.newline = true;
        }
    }
    fn peek_char(&self) -> char {
        self.at(if self.bp < self.length() { self.bp + 1 } else { self.length() })
    }
    fn string(&self, from: isize, to: isize) -> String {
        let from = from.clamp(0, self.length()) as usize;
        let to = to.clamp(from as isize, self.length()) as usize;
        self.buf[from..to].iter().collect()
    }
    fn skip_whitespace(&mut self) {
        while self.more() && whitespace(self.ch) {
            self.next_char();
        }
    }
    fn read_while(&mut self, part: impl Fn(char) -> bool) -> String {
        let start = self.bp;
        self.next_char();
        while self.more() && part(self.ch) {
            self.next_char();
        }
        self.string(start, self.bp)
    }
    fn add_pending_text(&mut self, list: &mut Vec<Tree>, end: isize) {
        if self.text_start != -1 {
            if self.text_start <= end {
                list.push(Tree::new(Kind::Text, self.text_start, self.string(self.text_start, end + 1)));
            }
            self.text_start = -1;
        }
    }
    fn erroneous(&mut self, code: &'static str, pos: isize) -> Tree {
        let mut at = self.bp - 1;
        while at > pos {
            match self.at(at) {
                '\u{c}' | '\n' | '\r' => self.newline = true,
                '\t' | ' ' => {}
                _ => break,
            }
            at -= 1;
        }
        self.text_start = -1;
        let mut tree = Tree::new(Kind::Erroneous, pos, self.string(pos, at + 1));
        tree.code = code;
        tree
    }
    fn escape(&mut self, list: &mut Vec<Tree>) {
        self.add_pending_text(list, self.bp - 1);
        self.next_char();
        list.push(Tree::new(Kind::Escape, self.bp - 1, self.ch.to_string()));
        self.newline = false;
        self.next_char();
        self.text_start = self.bp;
    }

    fn block_content(&mut self) -> Vec<Tree> {
        let mut trees = Vec::new();
        self.text_start = -1;
        while self.more() {
            match self.ch {
                '\n' | '\r' | '\u{c}' | ' ' | '\t' => self.next_char(),
                '&' => self.entity_into(&mut trees),
                '<' => {
                    self.newline = false;
                    self.add_pending_text(&mut trees, self.bp - 1);
                    let element = self.html();
                    trees.push(element);
                    if self.text_start == -1 {
                        self.text_start = self.bp;
                        self.last_non_white = -1;
                    }
                }
                '{' => self.inline_tag_into(&mut trees),
                '@' if self.newline => {
                    if matches!(self.peek_char(), '@' | '*') {
                        self.escape(&mut trees);
                    } else {
                        self.add_pending_text(&mut trees, self.last_non_white);
                        break;
                    }
                }
                '@' if self.text_start != -1 && self.at(self.bp - 1) == '*' && self.peek_char() == '/' => self.escape(&mut trees),
                _ => {
                    self.newline = false;
                    if self.text_start == -1 {
                        self.text_start = self.bp;
                    }
                    self.last_non_white = self.bp;
                    self.next_char();
                }
            }
        }
        if self.last_non_white != -1 {
            self.add_pending_text(&mut trees, self.last_non_white);
        }
        trees
    }

    fn block_tags(&mut self) -> Vec<Tree> {
        let mut tags = Vec::new();
        while self.more() && self.ch == '@' {
            let tag = self.block_tag();
            tags.push(tag);
        }
        tags
    }

    fn block_tag(&mut self) -> Tree {
        self.newline = false;
        let pos = self.bp;
        self.next_char();
        if !identifier_start(self.ch) {
            self.block_content();
            return self.erroneous("dc.no.tag.name", pos);
        }
        let name = self.read_tag_name();
        match tag_place(&name) {
            None => {
                let content = self.block_content();
                Tree::new(Kind::UnknownBlock, pos, name).with(content)
            }
            Some((Place::Inline, _)) => self.erroneous("dc.bad.inline.tag", pos),
            Some(_) => match self.tag(&name, pos, Place::Block) {
                Ok(tree) => tree,
                Err(code) => {
                    self.block_content();
                    self.erroneous(code, pos)
                }
            },
        }
    }

    fn read_tag_name(&mut self) -> String {
        self.read_while(|letter| identifier_part(letter) || matches!(letter, '.' | '-' | ':'))
    }

    fn inline_tag_into(&mut self, list: &mut Vec<Tree>) {
        self.newline = false;
        self.next_char();
        if self.ch != '@' {
            if self.text_start == -1 {
                self.text_start = self.bp - 1;
            }
            self.last_non_white = self.bp;
        } else if self.peek_char() == '@' {
            if self.text_start == -1 {
                self.text_start = self.bp - 1;
            }
            self.add_pending_text(list, self.bp - 1);
            self.next_char();
            list.push(Tree::new(Kind::Escape, self.bp - 1, "@"));
            self.next_char();
            self.text_start = -1;
            self.last_non_white = self.bp;
        } else {
            self.add_pending_text(list, self.bp - 2);
            let tag = self.inline_tag();
            list.push(tag);
            self.text_start = self.bp;
            self.last_non_white = -1;
        }
    }

    fn inline_tag(&mut self) -> Tree {
        let pos = self.bp - 1;
        self.next_char();
        if !identifier_start(self.ch) {
            return self.erroneous("dc.no.tag.name", pos);
        }
        let name = self.read_tag_name();
        let unknown = |parser: &mut Self, name: String| -> Parsed<Tree> {
            let text = parser.inline_text(Keep::Nothing)?;
            parser.next_char();
            Ok(Tree::new(Kind::UnknownInline, pos, name).with(vec![text]).ending(parser.bp))
        };
        let parsed = match tag_place(&name) {
            None => {
                self.skip_whitespace();
                unknown(self, name)
            }
            Some((place, keep_space)) => {
                if !keep_space {
                    self.skip_whitespace();
                }
                if place == Place::Block { unknown(self, name) } else { self.tag(&name, pos, Place::Inline).map(|tree| tree.ending(self.bp)) }
            }
        };
        parsed.unwrap_or_else(|code| self.erroneous(code, pos))
    }

    fn inline_text(&mut self, keep: Keep) -> Parsed<Tree> {
        match keep {
            Keep::Nothing => self.skip_whitespace(),
            Keep::NotFirstSpace if self.ch == ' ' => self.next_char(),
            _ => {}
        }
        let pos = self.bp;
        let mut depth = 1;
        while self.more() {
            match self.ch {
                '\n' | '\r' | '\u{c}' | ' ' | '\t' => {}
                '{' => {
                    self.newline = false;
                    self.last_non_white = self.bp;
                    depth += 1;
                }
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Ok(Tree::new(Kind::Text, pos, self.string(pos, self.bp)));
                    }
                    self.newline = false;
                    self.last_non_white = self.bp;
                }
                _ => {
                    self.newline = false;
                    self.last_non_white = self.bp;
                }
            }
            self.next_char();
        }
        Err("dc.unterminated.inline.tag")
    }

    fn reference(&mut self, mode: Member) -> Parsed<Option<Tree>> {
        let pos = self.bp;
        let mut depth = 0;
        while self.more() {
            match self.ch {
                '\n' | '\r' | '\u{c}' | ' ' | '\t' => {
                    if depth == 0 {
                        break;
                    }
                }
                '(' | '<' => {
                    self.newline = false;
                    depth += 1;
                }
                ')' | '>' => {
                    self.newline = false;
                    depth -= 1;
                }
                '}' => {
                    if self.bp == pos {
                        return Ok(None);
                    }
                    self.newline = false;
                    break;
                }
                '@' => {
                    if self.newline {
                        break;
                    }
                }
                _ => self.newline = false,
            }
            self.next_char();
        }
        if depth > 0 {
            return Err("dc.unterminated.signature");
        }
        let signature = self.string(pos, self.bp);
        if !super::docref::reference_ok(&signature, mode == Member::Required, mode == Member::Disallowed, mode == Member::Optional) {
            return Err("dc.ref.syntax.error");
        }
        Ok(Some(Tree::new(Kind::Reference, pos, signature).ending(self.bp)))
    }

    fn identifier(&mut self) -> Parsed<Tree> {
        self.skip_whitespace();
        let pos = self.bp;
        if java_start(self.ch) {
            let name = self.read_while(java_part);
            return Ok(Tree::new(Kind::Identifier, pos, name));
        }
        Err("dc.identifier.expected")
    }

    fn quoted_string(&mut self) -> Option<Tree> {
        self.newline = false;
        let pos = self.bp;
        self.next_char();
        while self.more() {
            match self.ch {
                '"' => {
                    self.next_char();
                    return Some(Tree::new(Kind::Text, pos, self.string(pos, self.bp)));
                }
                '@' if self.newline => break,
                _ => {}
            }
            self.next_char();
        }
        None
    }

    fn inline_word(&mut self) -> Option<Tree> {
        let pos = self.bp;
        let mut depth = 0;
        while self.more() {
            match self.ch {
                '\n' | '\r' | '\u{c}' | ' ' | '\t' => return Some(Tree::new(Kind::Text, pos, self.string(pos, self.bp))),
                '@' if self.newline => break,
                '{' => depth += 1,
                '}' => {
                    if depth == 0 {
                        return Some(Tree::new(Kind::Text, pos, self.string(pos, self.bp)));
                    }
                    depth -= 1;
                }
                _ => {}
            }
            self.newline = false;
            self.next_char();
        }
        None
    }

    fn inline_content(&mut self) -> Vec<Tree> {
        let mut trees = Vec::new();
        self.skip_whitespace();
        let pos = self.bp;
        let mut depth = 1;
        self.text_start = -1;
        while self.more() {
            match self.ch {
                '\n' | '\r' | '\u{c}' | ' ' | '\t' => self.next_char(),
                '&' => self.entity_into(&mut trees),
                '<' => {
                    self.newline = false;
                    self.add_pending_text(&mut trees, self.bp - 1);
                    let element = self.html();
                    trees.push(element);
                    self.text_start = self.bp;
                    self.last_non_white = -1;
                }
                '{' => {
                    if self.text_start == -1 {
                        self.text_start = self.bp;
                    }
                    self.newline = false;
                    self.next_char();
                    if self.ch == '@' {
                        self.add_pending_text(&mut trees, self.bp - 2);
                        let tag = self.inline_tag();
                        trees.push(tag);
                        self.text_start = self.bp;
                        self.last_non_white = -1;
                    } else {
                        depth += 1;
                    }
                }
                '}' => {
                    self.newline = false;
                    depth -= 1;
                    if depth == 0 {
                        self.add_pending_text(&mut trees, self.bp - 1);
                        self.next_char();
                        return trees;
                    }
                    self.next_char();
                }
                '@' if self.newline && matches!(self.peek_char(), '@' | '*') => self.escape(&mut trees),
                '@' if !self.newline && self.text_start != -1 && self.at(self.bp - 1) == '*' && self.peek_char() == '/' => self.escape(&mut trees),
                _ => {
                    if self.text_start == -1 {
                        self.text_start = self.bp;
                    }
                    self.next_char();
                }
            }
        }
        vec![self.erroneous("dc.unterminated.inline.tag", pos)]
    }

    fn entity_into(&mut self, list: &mut Vec<Tree>) {
        self.newline = false;
        self.add_pending_text(list, self.bp - 1);
        let entity = self.entity();
        list.push(entity);
        if self.text_start == -1 {
            self.text_start = self.bp;
            self.last_non_white = -1;
        }
    }

    fn entity(&mut self) -> Tree {
        let pos = self.bp;
        self.next_char();
        let mut name = None;
        if self.ch == '#' {
            let start = self.bp;
            self.next_char();
            let digits = |parser: &mut Self, digit: fn(char) -> bool| {
                parser.next_char();
                while parser.more() && digit(parser.ch) {
                    parser.next_char();
                }
            };
            if self.ch.is_ascii_digit() {
                digits(self, |letter| letter.is_ascii_digit());
                name = Some(self.string(start, self.bp));
            } else if matches!(self.ch, 'x' | 'X') {
                self.next_char();
                if self.ch.is_ascii_hexdigit() {
                    digits(self, |letter| letter.is_ascii_hexdigit());
                    name = Some(self.string(start, self.bp));
                }
            }
        } else if identifier_start(self.ch) {
            name = Some(self.read_while(identifier_part));
        }
        match name {
            None => self.erroneous("dc.bad.entity", pos),
            Some(_) if self.ch != ';' => self.erroneous("dc.missing.semicolon", pos),
            Some(name) => {
                self.next_char();
                Tree::new(Kind::Entity, pos, name)
            }
        }
    }

    fn html(&mut self) -> Tree {
        let pos = self.bp;
        self.next_char();
        if identifier_start(self.ch) {
            let name = self.read_while(identifier_part);
            let attributes = self.html_attributes();
            if self.ch == '/' {
                self.next_char();
            }
            if self.ch == '>' {
                self.next_char();
                return Tree::new(Kind::StartElement, pos, name).with(attributes).ending(self.bp);
            }
        } else if self.ch == '/' {
            self.next_char();
            if identifier_start(self.ch) {
                let name = self.read_while(identifier_part);
                self.skip_whitespace();
                if self.ch == '>' {
                    self.next_char();
                    return Tree::new(Kind::EndElement, pos, name).ending(self.bp);
                }
            }
        } else if self.ch == '!' {
            self.next_char();
            if self.ch == '-' {
                self.next_char();
                if self.ch == '-' {
                    self.next_char();
                    while self.more() {
                        let mut dashes = 0;
                        while self.more() && self.ch == '-' {
                            dashes += 1;
                            self.next_char();
                        }
                        if dashes >= 2 && self.ch == '>' {
                            self.next_char();
                            return Tree::new(Kind::HtmlComment, pos, self.string(pos, self.bp));
                        }
                        self.next_char();
                    }
                }
            } else if identifier_start(self.ch) && self.string(self.bp, self.bp + 7).eq_ignore_ascii_case("doctype") && !identifier_part(self.at(self.bp + 7)) {
                self.read_while(identifier_part);
                self.next_char();
                self.skip_whitespace();
                let start = self.bp;
                while self.more() {
                    if self.ch == '>' {
                        let mark = self.bp;
                        self.next_char();
                        return Tree::new(Kind::DocType, start, self.string(start, mark));
                    }
                    self.next_char();
                }
            } else {
                for wanted in "[CDATA[".chars() {
                    if self.ch == wanted {
                        self.next_char();
                    } else {
                        return self.erroneous("dc.invalid.html", pos);
                    }
                }
                while self.more() {
                    if self.ch == ']' {
                        let mut closing = 0;
                        while self.more() && self.ch == ']' {
                            closing += 1;
                            self.next_char();
                        }
                        if closing >= 2 && self.ch == '>' {
                            self.next_char();
                            return Tree::new(Kind::Text, pos, self.string(pos, self.bp));
                        }
                    } else {
                        self.next_char();
                    }
                }
                return self.erroneous("dc.invalid.html", pos);
            }
        }
        self.bp = pos + 1;
        self.ch = self.at(self.bp);
        self.erroneous("dc.malformed.html", pos)
    }

    fn html_attributes(&mut self) -> Vec<Tree> {
        let mut attributes = Vec::new();
        self.skip_whitespace();
        while self.more() && identifier_start(self.ch) {
            let pos = self.bp;
            let name = self.read_while(|letter| identifier_part(letter) || letter == '-');
            self.skip_whitespace();
            let mut value = Vec::new();
            if self.ch == '=' {
                self.next_char();
                self.skip_whitespace();
                if matches!(self.ch, '\'' | '"') {
                    self.newline = false;
                    let quote = self.ch;
                    self.next_char();
                    self.text_start = self.bp;
                    while self.more() && self.ch != quote {
                        if self.newline && self.ch == '@' {
                            let broken = self.erroneous("dc.unterminated.string", pos);
                            attributes.push(broken);
                            return attributes;
                        }
                        self.attribute_value_char(&mut value);
                    }
                    self.add_pending_text(&mut value, self.bp - 1);
                    self.next_char();
                } else {
                    self.text_start = self.bp;
                    while self.more() && !matches!(self.ch, '\u{c}' | '\n' | '\r' | '\t' | ' ' | '"' | '\'' | '`' | '=' | '<' | '>') {
                        self.attribute_value_char(&mut value);
                    }
                    self.add_pending_text(&mut value, self.bp - 1);
                }
                self.skip_whitespace();
            }
            attributes.push(Tree::new(Kind::Attribute, pos, name).with(value));
        }
        attributes
    }

    fn attribute_value_char(&mut self, list: &mut Vec<Tree>) {
        match self.ch {
            '&' => self.entity_into(list),
            '{' => self.inline_tag_into(list),
            _ => self.next_char(),
        }
    }

    fn snippet_attributes(&mut self) -> Vec<Tree> {
        let mut attributes = Vec::new();
        self.skip_whitespace();
        while self.more() && identifier_start(self.ch) {
            let pos = self.bp;
            let name = self.read_while(|letter| identifier_part(letter) || letter == '-');
            self.skip_whitespace();
            let mut value = Vec::new();
            if self.ch == '=' {
                self.next_char();
                self.skip_whitespace();
                if matches!(self.ch, '\'' | '"') {
                    self.newline = false;
                    let quote = self.ch;
                    self.next_char();
                    self.text_start = self.bp;
                    while self.more() && self.ch != quote {
                        self.next_char();
                    }
                    self.add_pending_text(&mut value, self.bp - 1);
                    self.next_char();
                } else {
                    self.text_start = self.bp;
                    while self.more() && !matches!(self.ch, '}' | ':' | '\u{c}' | '\n' | '\r' | '\t' | ' ' | '"' | '\'' | '`' | '=' | '<' | '>') {
                        self.next_char();
                    }
                    self.add_pending_text(&mut value, self.bp - 1);
                }
                self.skip_whitespace();
            }
            attributes.push(Tree::new(Kind::Attribute, pos, name).with(value));
        }
        attributes
    }

    /// The parser of one standard tag, after its name.
    fn tag(&mut self, name: &str, pos: isize, place: Place) -> Parsed<Tree> {
        let block = |children: Vec<Tree>, lead: usize| {
            let mut tree = Tree::new(Kind::Block, pos, name).with(children);
            tree.lead = lead;
            tree
        };
        let inline = |children: Vec<Tree>| Tree::new(Kind::Inline, pos, name).with(children);
        let at_end = |parser: &Self| parser.bp >= parser.length();
        Ok(match name {
            "author" | "deprecated" | "hidden" | "serialData" | "serial" | "since" | "version" => block(self.block_content(), 0),
            "code" | "literal" => {
                let text = self.inline_text(Keep::NotFirstSpace)?;
                self.next_char();
                inline(vec![text])
            }
            "docRoot" | "inheritDoc" => {
                if self.ch != '}' {
                    self.inline_text(Keep::Nothing)?;
                    self.next_char();
                    return Err("dc.unexpected.content");
                }
                self.next_char();
                inline(Vec::new())
            }
            "exception" | "throws" | "provides" | "uses" => {
                self.skip_whitespace();
                let mut children: Vec<Tree> = self.reference(Member::Disallowed)?.into_iter().collect();
                let lead = children.len();
                children.extend(self.block_content());
                block(children, lead)
            }
            "index" => {
                self.skip_whitespace();
                if self.ch == '}' {
                    return Err("dc.no.content");
                }
                let term = if self.ch == '"' { self.quoted_string() } else { self.inline_word() };
                let mut children = vec![term.ok_or("dc.no.content")?];
                self.skip_whitespace();
                if self.ch != '}' {
                    children.extend(self.inline_content());
                } else {
                    self.next_char();
                }
                inline(children)
            }
            "link" | "linkplain" => {
                let mut children: Vec<Tree> = self.reference(Member::Optional)?.into_iter().collect();
                children.extend(self.inline_content());
                inline(children)
            }
            "param" => {
                self.skip_whitespace();
                let type_parameter = self.ch == '<';
                if type_parameter {
                    self.next_char();
                }
                let mut children = vec![self.identifier()?];
                if type_parameter {
                    if self.ch != '>' {
                        return Err("dc.gt.expected");
                    }
                    self.next_char();
                }
                self.skip_whitespace();
                children.extend(self.block_content());
                let mut tree = block(children, 1);
                tree.type_parameter = type_parameter;
                tree
            }
            "return" if place == Place::Block => block(self.block_content(), 0),
            "return" | "summary" => inline(self.inline_content()),
            "see" => {
                self.skip_whitespace();
                match self.ch {
                    '"' => {
                        if let Some(quoted) = self.quoted_string() {
                            self.skip_whitespace();
                            if self.ch == '@' || (self.ch == EOI && at_end(self)) {
                                return Ok(block(vec![quoted], 0));
                            }
                        }
                    }
                    '<' => return Ok(block(self.block_content(), 0)),
                    '@' if self.newline => return Err("dc.no.content"),
                    '@' => {}
                    EOI if at_end(self) => return Err("dc.no.content"),
                    EOI => {}
                    letter if java_start(letter) || letter == '#' => {
                        let mut children: Vec<Tree> = self.reference(Member::Optional)?.into_iter().collect();
                        children.extend(self.block_content());
                        return Ok(block(children, 0));
                    }
                    _ => {}
                }
                return Err("dc.unexpected.content");
            }
            "serialField" => {
                self.skip_whitespace();
                let mut children = vec![self.identifier()?];
                self.skip_whitespace();
                children.extend(self.reference(Member::Disallowed)?);
                let lead = children.len();
                if whitespace(self.ch) {
                    self.skip_whitespace();
                    children.extend(self.block_content());
                }
                block(children, lead)
            }
            "snippet" => {
                self.skip_whitespace();
                let mut children = self.snippet_attributes();
                if self.ch == '}' {
                    self.next_char();
                } else if self.ch == ':' {
                    self.newline = false;
                    self.next_char();
                    while self.more() && matches!(self.ch, ' ' | '\t') {
                        self.next_char();
                    }
                    if !self.newline {
                        return Err(if at_end(self) { "dc.no.content" } else { "dc.unexpected.content" });
                    }
                    self.next_char();
                    children.push(self.inline_text(Keep::All)?);
                    self.next_char();
                } else {
                    return Err(if at_end(self) { "dc.no.content" } else { "dc.unexpected.content" });
                }
                inline(children)
            }
            "spec" => {
                self.skip_whitespace();
                let url = self.inline_word().filter(|url| !url.name.trim().is_empty()).ok_or("dc.no.url")?;
                self.skip_whitespace();
                let title = self.block_content();
                if title.iter().all(|part| part.kind == Kind::Text && part.name.trim().is_empty()) {
                    return Err("dc.no.title");
                }
                let mut children = vec![url];
                children.extend(title);
                block(children, 1)
            }
            "systemProperty" => {
                self.skip_whitespace();
                if self.ch == '}' {
                    return Err("dc.no.content");
                }
                let pos = self.bp;
                self.next_char();
                while (self.more() && identifier_part(self.ch)) || self.ch == '.' {
                    self.next_char();
                }
                let property = Tree::new(Kind::Text, pos, self.string(pos, self.bp));
                self.skip_whitespace();
                if self.ch != '}' {
                    self.next_char();
                    return Err("dc.unexpected.content");
                }
                self.next_char();
                inline(vec![property])
            }
            "value" => {
                self.skip_whitespace();
                let mut children = Vec::new();
                match self.ch {
                    '%' => {
                        children.extend(self.inline_word());
                        self.skip_whitespace();
                    }
                    '"' => {
                        children.extend(self.quoted_string());
                        self.skip_whitespace();
                    }
                    _ => {}
                }
                children.extend(self.reference(Member::Required)?);
                self.skip_whitespace();
                if self.ch != '}' {
                    self.next_char();
                    return Err("dc.unexpected.content");
                }
                self.next_char();
                inline(children)
            }
            _ => return Err("dc.unexpected.content"),
        })
    }
}
