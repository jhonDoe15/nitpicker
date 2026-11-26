use super::{JNode, Parser, Result, Stop, flush, push_char, trimmed};

const VOID: &[&str] = &[
    "area", "base", "basefont", "br", "col", "frame", "hr", "img", "input", "isindex", "link",
    "meta", "param",
];

fn name_start(c: Option<char>) -> bool {
    c.is_some_and(|c| c.is_ascii_alphabetic())
}

fn name_part(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '.')
}

struct Tag {
    nodes: Vec<JNode>,
    name: String,
    closed_itself: bool,
    next: usize,
}

impl Parser<'_> {
    pub fn start_tag_at(&self, at: usize) -> bool {
        self.ch(at) == Some('<') && name_start(self.ch(at + 1))
    }
    pub fn end_tag_at(&self, at: usize) -> bool {
        self.ch(at) == Some('<') && self.ch(at + 1) == Some('/') && name_start(self.ch(at + 2))
    }
    pub fn comment_at(&self, at: usize) -> bool {
        (0..4).all(|offset| self.ch(at + offset) == "<!--".chars().nth(offset))
    }
    pub fn html_at(&self, at: usize) -> bool {
        self.start_tag_at(at) || self.end_tag_at(at) || self.comment_at(at)
    }

    fn word(&self, mut at: usize) -> (String, usize) {
        let mut word = String::new();
        while let Some(c) = self.ch(at).filter(|c| name_part(*c)) {
            word.push(c);
            at += 1;
        }
        (word, at)
    }

    fn spaces(&self, mut at: usize, into: &mut Vec<JNode>) -> usize {
        let mut text = None;
        while at < self.toks.len() {
            match self.toks[at].ch() {
                Some(c @ (' ' | '\t' | '\u{c}')) => push_char(&mut text, &self.toks[at], c),
                Some(_) => break,
                None => {
                    flush(&mut text, into);
                    into.push(self.toks[at].node());
                }
            }
            at += 1;
        }
        flush(&mut text, into);
        at
    }

    fn start_tag(&self, at: usize) -> Result<Tag> {
        let mut nodes = vec![JNode::leaf("TAG_OPEN", &self.toks[at], "<".into())];
        let (name, mut next) = self.word(at + 1);
        nodes.push(JNode::leaf("TAG_NAME", &self.toks[at + 1], name.clone()));
        let mut attributes = Vec::new();
        loop {
            let mut attribute = Vec::new();
            let after = self.spaces(next, &mut attribute);
            match self.ch(after) {
                Some('>') => {
                    push_attributes(&mut nodes, attributes);
                    nodes.extend(attribute);
                    nodes.push(JNode::leaf("TAG_CLOSE", &self.toks[after], ">".into()));
                    return Ok(Tag {
                        nodes,
                        name,
                        closed_itself: false,
                        next: after + 1,
                    });
                }
                Some('/') if self.ch(after + 1) == Some('>') => {
                    push_attributes(&mut nodes, attributes);
                    nodes.push(JNode::leaf(
                        "TAG_SLASH_CLOSE",
                        &self.toks[after],
                        "/>".into(),
                    ));
                    return Ok(Tag {
                        nodes,
                        name,
                        closed_itself: true,
                        next: after + 2,
                    });
                }
                Some(c)
                    if name_start(Some(c))
                        && (after > next
                            || self.toks[after - 1].ch().is_none_or(char::is_whitespace)) =>
                {
                    let (attr, end) = self.word(after);
                    attribute.push(JNode::leaf("TAG_ATTR_NAME", &self.toks[after], attr));
                    next = self.attribute_value(end, &mut attribute)?;
                    attributes.push(JNode::branch("HTML_ATTRIBUTE", attribute));
                }
                _ => return Err(()),
            }
        }
    }

    fn attribute_value(&self, at: usize, attribute: &mut Vec<JNode>) -> Result<usize> {
        let mut spaces = Vec::new();
        let after = self.spaces(at, &mut spaces);
        if self.ch(after) != Some('=') {
            return Ok(at);
        }
        attribute.extend(spaces);
        attribute.push(JNode::leaf("EQUALS", &self.toks[after], "=".into()));
        let mut index = after + 1;
        while let Some(tok) = self.toks.get(index).filter(|tok| tok.ch().is_none()) {
            attribute.push(tok.node());
            index += 1;
        }
        let start = index;
        let mut value = String::new();
        while self.is_space(index) {
            value.push(self.ch(index).unwrap_or(' '));
            index += 1;
        }
        match self.ch(index) {
            Some(quote @ ('"' | '\'')) => {
                value.push(quote);
                index += 1;
                loop {
                    match self.ch(index) {
                        Some(c) if c == quote => break,
                        Some(c) => value.push(c),
                        None => return Err(()),
                    }
                    index += 1;
                }
                value.push(quote);
                index += 1;
            }
            Some(c) if !matches!(c, '>' | '<') => {
                while let Some(c) = self
                    .ch(index)
                    .filter(|c| !c.is_whitespace() && !matches!(c, '>' | '<'))
                {
                    if c == '/' && self.ch(index + 1) == Some('>') {
                        break;
                    }
                    value.push(c);
                    index += 1;
                }
                while self.is_space(index) {
                    value.push(self.ch(index).unwrap_or(' '));
                    index += 1;
                }
            }
            _ => return Err(()),
        }
        attribute.push(JNode::leaf("ATTRIBUTE_VALUE", &self.toks[start], value));
        Ok(index)
    }

    fn end_tag(&self, at: usize) -> Result<(JNode, String, usize)> {
        let mut nodes = vec![
            JNode::leaf("TAG_OPEN", &self.toks[at], "<".into()),
            JNode::leaf("TAG_SLASH", &self.toks[at + 1], "/".into()),
        ];
        let (name, next) = self.word(at + 2);
        nodes.push(JNode::leaf("TAG_NAME", &self.toks[at + 2], name.clone()));
        let after = self.spaces(next, &mut nodes);
        if self.ch(after) != Some('>') {
            return Err(());
        }
        nodes.push(JNode::leaf("TAG_CLOSE", &self.toks[after], ">".into()));
        Ok((JNode::branch("HTML_TAG_END", nodes), name, after + 1))
    }

    pub fn element(&self, at: usize) -> Result<(JNode, Vec<JNode>, usize)> {
        if let Some(known) = self.elements.borrow().get(&at) {
            return known.clone();
        }
        let result = self.parse_element(at);
        self.elements.borrow_mut().insert(at, result.clone());
        result
    }

    fn parse_element(&self, at: usize) -> Result<(JNode, Vec<JNode>, usize)> {
        let tag = self.start_tag(at)?;
        if tag.closed_itself || VOID.contains(&tag.name.to_ascii_lowercase().as_str()) {
            let parts = if tag.closed_itself {
                tag.nodes
            } else {
                vec![JNode::branch("HTML_TAG_START", tag.nodes)]
            };
            let void = JNode::branch("VOID_ELEMENT", parts);
            return Ok((
                JNode::branch("HTML_ELEMENT", vec![void]),
                Vec::new(),
                tag.next,
            ));
        }
        let start = JNode::branch("HTML_TAG_START", tag.nodes);
        if self.balanced(tag.next, &tag.name) {
            let (children, end) = self.content(tag.next, Stop::Element)?;
            if !self.end_tag_at(end) {
                return Err(());
            }
            let (end_node, name, next) = self.end_tag(end)?;
            if name.eq_ignore_ascii_case(&tag.name) {
                let (lead, middle, tail) = trimmed(children);
                let mut nodes = vec![start];
                nodes.extend(lead);
                if !middle.is_empty() {
                    nodes.push(JNode::branch("HTML_CONTENT", middle));
                }
                nodes.extend(tail);
                nodes.push(end_node);
                return Ok((JNode::branch("HTML_ELEMENT", nodes), Vec::new(), next));
            }
            return Err(());
        }
        let (plain, next) = self.plain(tag.next)?;
        let (lead, middle, mut tail) = trimmed(plain);
        let mut nodes = vec![start];
        if middle.is_empty() {
            tail.splice(0..0, lead);
        } else {
            nodes.extend(lead);
            nodes.push(JNode::branch("HTML_CONTENT", middle));
        }
        Ok((JNode::branch("HTML_ELEMENT", nodes), tail, next))
    }

    /// Whether start and end tags of this name balance out after a start tag, counting `<name/>` as a start.
    fn balanced(&self, mut at: usize, name: &str) -> bool {
        let mut depth = 1usize;
        while at < self.toks.len() {
            if self.ch(at) == Some('{') && self.ch(at + 1) == Some('@') {
                let mut braces = 0usize;
                while let Some(tok) = self.toks.get(at) {
                    match tok.ch() {
                        Some('{') => braces += 1,
                        Some('}') => {
                            braces -= 1;
                            if braces == 0 {
                                break;
                            }
                        }
                        _ => {}
                    }
                    at += 1;
                }
            } else if self.comment_at(at) {
                while at < self.toks.len()
                    && !(0..3).all(|o| self.ch(at + o) == "-->".chars().nth(o))
                {
                    at += 1;
                }
            } else if self.start_tag_at(at) && self.word(at + 1).0.eq_ignore_ascii_case(name) {
                depth += 1;
            } else if self.end_tag_at(at) && self.word(at + 2).0.eq_ignore_ascii_case(name) {
                depth -= 1;
                if depth == 0 {
                    return true;
                }
            }
            at += 1;
        }
        false
    }
}

fn push_attributes(nodes: &mut Vec<JNode>, attributes: Vec<JNode>) {
    if !attributes.is_empty() {
        nodes.push(JNode::branch("HTML_ATTRIBUTES", attributes));
    }
}
