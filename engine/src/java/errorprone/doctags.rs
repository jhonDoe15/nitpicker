//! Block tags (`@param x text`) and inline tags (`{@link Type label}`), each with the form the specification gives it.
use super::doc::{Kind, Tree, is_space};
use super::docparse::{Parser, Until, java_part, java_start, name_part, name_start};
use super::docref::Form;

/// Tags that only exist in braces: at the start of a line they are an error.
const INLINE_ONLY: &[&str] = &["code", "docRoot", "index", "inheritDoc", "link", "linkplain", "literal", "snippet", "summary", "systemProperty", "value"];
const BLOCK: &[&str] = &[
    "author", "deprecated", "exception", "hidden", "param", "provides", "return", "see", "serial", "serialData", "serialField", "since", "spec", "throws",
    "uses", "version",
];

fn tag_part(character: char) -> bool {
    name_part(character) || matches!(character, '-' | '.' | ':')
}

impl Parser<'_> {
    fn at_block_end(&self) -> bool {
        self.peek().is_none_or(|character| character == '@' && self.line_start)
    }

    /// The block tags that follow the main description. javac stops reading at an inline-only tag used as a block
    /// tag, so nothing after one is reported.
    pub fn block_tags(&mut self) -> Vec<Tree> {
        let mut out = Vec::new();
        while self.peek() == Some('@') {
            let from = self.at;
            self.at += 1;
            self.line_start = false;
            let Some(name) = self.word(name_start, tag_part) else {
                out.push(self.whole_block(from, "dc.no.tag.name"));
                continue;
            };
            if INLINE_ONLY.contains(&name.as_str()) {
                out.push(Tree::erroneous(self.slice(from, self.at), from, self.at, "dc.bad.inline.tag"));
                break;
            }
            let named = self.at;
            self.skip_space();
            match self.block_tag(&name) {
                Ok((children, described)) => {
                    let kind = if BLOCK.contains(&name.as_str()) { Kind::Block } else { Kind::UnknownBlock };
                    let generic = name == "param" && children.len() == 1 && self.text[named..children[0].pos].contains(&'<');
                    let end = children.last().map_or(named, |last| last.end + usize::from(generic));
                    out.push(Tree { children, described, ..Tree::leaf(kind, name, from, end) });
                }
                Err(code) => out.push(self.whole_block(from, code)),
            }
        }
        out
    }

    /// A block tag that could not be read is erroneous up to the next block tag.
    fn whole_block(&mut self, from: usize, code: &'static str) -> Tree {
        self.description();
        let end = self.trimmed(from, self.at);
        Tree::erroneous(self.slice(from, end), from, end, code)
    }

    /// Reads `"text"`; false when the quote is still open at the next block tag or the end of the comment.
    fn quoted(&mut self) -> bool {
        self.at += 1;
        while let Some(character) = self.peek().filter(|character| *character != '"' && !self.at_block_end()) {
            self.line_start = character == '\n' || (self.line_start && is_space(character));
            self.at += 1;
        }
        let closed = self.peek() == Some('"');
        self.at += usize::from(closed);
        closed
    }

    fn identifier(&mut self) -> Result<Tree, &'static str> {
        let from = self.at;
        let name = self.word(java_start, java_part).ok_or("dc.identifier.expected")?;
        Ok(Tree::leaf(Kind::Identifier, name, from, self.at))
    }

    /// What follows the name of a block tag: its children and where its description starts among them.
    fn block_tag(&mut self, name: &str) -> Result<(Vec<Tree>, usize), &'static str> {
        let mut children = Vec::new();
        match name {
            "param" => {
                let generic = self.peek() == Some('<');
                self.at += usize::from(generic);
                self.skip_space();
                children.push(self.identifier()?);
                if generic {
                    if self.peek() != Some('>') {
                        return Err("dc.gt.expected");
                    }
                    self.at += 1;
                }
            }
            "throws" | "exception" | "provides" | "uses" => children.push(self.reference(Form::Type)?),
            "serialField" => {
                children.push(self.identifier()?);
                self.skip_space();
                children.push(self.reference(Form::Type)?);
            }
            "spec" => {
                if self.at_block_end() {
                    return Err("dc.no.url");
                }
                let from = self.at;
                while self.peek().is_some_and(|character| !is_space(character)) {
                    self.at += 1;
                }
                if self.at == from {
                    return Err("dc.no.url");
                }
                children.push(Tree::text(from, self.at));
                self.skip_space();
                if self.at_block_end() {
                    return Err("dc.no.title");
                }
            }
            "see" => return self.see(),
            _ => {}
        }
        let described = children.len();
        self.skip_space();
        children.extend(self.description());
        Ok((children, described))
    }

    /// `@see "text"`, `@see <a href="...">label</a>` or `@see reference label`.
    fn see(&mut self) -> Result<(Vec<Tree>, usize), &'static str> {
        match self.peek() {
            Some('"') => {
                let from = self.at;
                if !self.quoted() {
                    return Err("dc.unexpected.content");
                }
                let text = Tree::text(from, self.at);
                self.skip_space();
                if !self.at_block_end() {
                    return Err("dc.unexpected.content");
                }
                Ok((vec![text], 0))
            }
            Some('<') => Ok((self.description(), 0)),
            Some(first) if java_start(first) || first == '#' => {
                let mut children = vec![self.reference(Form::Full)?];
                self.skip_space();
                children.extend(self.description());
                Ok((children, 1))
            }
            _ if self.at_block_end() => Err("dc.no.content"),
            _ => Err("dc.unexpected.content"),
        }
    }

    /// `{@name ...}`. What cannot be read is erroneous from the brace up to where reading stopped.
    pub fn inline_tag(&mut self) -> Tree {
        let from = self.at;
        self.at += 2;
        self.line_start = false;
        let Some(name) = self.word(name_start, tag_part) else {
            return Tree::erroneous("{@".to_string(), from, from + 2, "dc.no.tag.name");
        };
        let known = INLINE_ONLY.contains(&name.as_str()) || name == "return";
        let mut tree = Tree::leaf(if known { Kind::Inline } else { Kind::UnknownInline }, name, from, from);
        match self.inline_body(&mut tree) {
            Ok(()) => {
                self.line_start = false;
                tree
            }
            Err(code) => self.erroneous(from, code),
        }
    }

    /// Text up to the brace that closes the tag, counting the braces inside it.
    fn literal(&mut self, tree: &mut Tree) -> Result<(), &'static str> {
        let from = self.at;
        let mut depth = 1usize;
        while let Some(character) = self.peek() {
            depth += usize::from(character == '{');
            depth -= usize::from(character == '}');
            if depth == 0 {
                tree.children.push(Tree::text(from, self.at));
                self.at += 1;
                tree.end = self.at;
                return Ok(());
            }
            self.at += 1;
        }
        Err("dc.unterminated.inline.tag")
    }

    /// A description up to the closing brace. Without one the tag keeps what was read as an erroneous child and
    /// runs to the end of the comment.
    fn labelled(&mut self, tree: &mut Tree) {
        let from = self.at;
        let (children, closed) = self.content(Until::Brace);
        if closed {
            tree.children.extend(children);
            tree.end = self.at;
            return;
        }
        let end = self.trimmed(from, self.at);
        let rest = if from == self.text.len() { Tree::erroneous(String::new(), from + 2, from + 2, "") } else { Tree::erroneous(self.slice(from, end), from, end, "") };
        tree.children.push(Tree { code: "dc.unterminated.inline.tag", ..rest });
        tree.end = self.text.len() + 2;
    }

    fn closes(&mut self, tree: &mut Tree) -> bool {
        if self.peek() != Some('}') {
            return false;
        }
        self.at += 1;
        tree.end = self.at;
        true
    }

    fn inline_body(&mut self, tree: &mut Tree) -> Result<(), &'static str> {
        match tree.name.as_str() {
            "code" | "literal" => {
                self.at += usize::from(self.peek() == Some(' '));
                self.literal(tree)
            }
            "link" | "linkplain" => {
                self.skip_space();
                if self.closes(tree) {
                    return Ok(());
                }
                tree.children.push(self.reference(Form::Full)?);
                tree.described = 1;
                self.skip_space();
                self.labelled(tree);
                Ok(())
            }
            "index" => {
                self.skip_space();
                let from = self.at;
                if self.peek() == Some('"') {
                    if !self.quoted() {
                        return Err("dc.no.content");
                    }
                } else {
                    while self.peek().is_some_and(|character| !is_space(character) && character != '}') {
                        self.at += 1;
                    }
                }
                if self.at == from || self.peek().is_none() {
                    return Err("dc.no.content");
                }
                tree.children.push(Tree::text(from, self.at));
                tree.described = 1;
                self.skip_space();
                self.labelled(tree);
                Ok(())
            }
            "summary" | "return" => {
                self.skip_space();
                self.labelled(tree);
                Ok(())
            }
            "value" => {
                self.skip_space();
                if self.closes(tree) {
                    return Ok(());
                }
                if self.peek() == Some('%') {
                    let from = self.at;
                    while self.peek().is_some_and(|character| !is_space(character) && character != '}') {
                        self.at += 1;
                    }
                    tree.children.push(Tree::text(from, self.at));
                    self.skip_space();
                    if self.closes(tree) {
                        return Ok(());
                    }
                }
                tree.children.push(self.reference(Form::Full)?);
                self.skip_space();
                self.closed_or_unexpected(tree)
            }
            "inheritDoc" | "docRoot" => {
                self.skip_space();
                if self.closes(tree) {
                    return Ok(());
                }
                let mut rest = Tree::text(0, 0);
                self.literal(&mut rest)?;
                Err("dc.unexpected.content")
            }
            "systemProperty" => {
                self.skip_space();
                if self.peek() == Some('}') {
                    return Err("dc.no.content");
                }
                while self.peek().is_some_and(|character| java_part(character) || character == '.') {
                    self.at += 1;
                }
                self.skip_space();
                self.closed_or_unexpected(tree)
            }
            "snippet" => self.snippet(tree),
            _ => {
                self.skip_space();
                self.literal(tree)
            }
        }
    }

    /// After the last part of a tag only `}` may follow; javac reads one character past anything else.
    fn closed_or_unexpected(&mut self, tree: &mut Tree) -> Result<(), &'static str> {
        if self.closes(tree) {
            return Ok(());
        }
        self.at += usize::from(self.peek().is_some());
        Err("dc.unexpected.content")
    }

    /// `{@snippet attributes}` or `{@snippet attributes :` followed by a line break and the snippet's text.
    fn snippet(&mut self, tree: &mut Tree) -> Result<(), &'static str> {
        tree.children = self.attributes(true)?;
        tree.described = tree.children.len();
        match self.peek() {
            Some('}') => {
                self.closes(tree);
                Ok(())
            }
            Some(':') => {
                self.at += 1;
                while self.peek().is_some_and(|character| is_space(character) && character != '\n') {
                    self.at += 1;
                }
                if self.peek() != Some('\n') {
                    return Err("dc.unexpected.content");
                }
                self.at += 1;
                self.literal(tree)
            }
            None => Err("dc.no.content"),
            Some(_) => Err("dc.unexpected.content"),
        }
    }
}
