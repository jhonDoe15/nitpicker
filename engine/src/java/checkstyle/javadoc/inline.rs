use super::{JNode, Parser, Result, flush, push_char};

impl Parser<'_> {
    pub fn inline_tag(&self, at: usize) -> Result<(JNode, usize)> {
        self.inline.set(self.inline.get() + 1);
        let result = self.inline_tag_inside(at);
        self.inline.set(self.inline.get() - 1);
        result
    }

    fn inline_tag_inside(&self, at: usize) -> Result<(JNode, usize)> {
        let mut nodes = vec![JNode::leaf(
            "JAVADOC_INLINE_TAG_START",
            &self.toks[at],
            "{@".into(),
        )];
        let mut index = at + 2;
        let mut name = String::new();
        while let Some(c) = self.ch(index).filter(|c| !c.is_whitespace() && *c != '}') {
            name.push(c);
            index += 1;
        }
        if !name.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
            || !name.chars().all(|c| c.is_ascii_alphanumeric())
        {
            return Err(());
        }
        nodes.push(JNode::leaf("TAG_NAME", &self.toks[at + 2], name.clone()));
        let kind = match name.as_str() {
            "code" | "literal" => {
                index = self.raw_text(index, &mut nodes)?;
                if name == "code" {
                    "CODE_INLINE_TAG"
                } else {
                    "LITERAL_INLINE_TAG"
                }
            }
            "link" | "linkplain" | "value" => {
                index = self.spaces_into(index, &mut nodes);
                if self.ch(index) == Some('}') {
                    if name != "value" {
                        return Err(());
                    }
                } else {
                    let (reference, next) = self.reference(index)?;
                    nodes.push(reference);
                    index = self.description(next, &mut nodes, true)?;
                }
                match name.as_str() {
                    "link" => "LINK_INLINE_TAG",
                    "linkplain" => "LINKPLAIN_INLINE_TAG",
                    _ => "VALUE_INLINE_TAG",
                }
            }
            "inheritDoc" => "INHERIT_DOC_INLINE_TAG",
            _ => {
                index = self.description(index, &mut nodes, true)?;
                "CUSTOM_INLINE_TAG"
            }
        };
        if self.ch(index) != Some('}') {
            return Err(());
        }
        nodes.push(JNode::leaf(
            "JAVADOC_INLINE_TAG_END",
            &self.toks[index],
            "}".into(),
        ));
        let tag = JNode::branch(kind, nodes);
        Ok((JNode::branch("JAVADOC_INLINE_TAG", vec![tag]), index + 1))
    }

    fn raw_text(&self, mut at: usize, nodes: &mut Vec<JNode>) -> Result<usize> {
        let mut depth = 0usize;
        let mut text = None;
        loop {
            let Some(tok) = self.toks.get(at) else {
                return Err(());
            };
            match tok.ch() {
                Some('}') if depth == 0 => break,
                Some(c) => {
                    if c == '{' {
                        depth += 1;
                    } else if c == '}' {
                        depth -= 1;
                    }
                    push_char(&mut text, tok, c);
                }
                None => {
                    flush(&mut text, nodes);
                    nodes.push(tok.node());
                }
            }
            at += 1;
        }
        flush(&mut text, nodes);
        Ok(at)
    }

    pub fn spaces_into(&self, mut at: usize, nodes: &mut Vec<JNode>) -> usize {
        let mut text = None;
        while at < self.toks.len() {
            match self.toks[at].ch() {
                Some(c) if matches!(c, ' ' | '\t' | '\u{c}') => {
                    push_char(&mut text, &self.toks[at], c)
                }
                Some(_) => break,
                None => {
                    flush(&mut text, nodes);
                    nodes.push(self.toks[at].node());
                }
            }
            at += 1;
        }
        flush(&mut text, nodes);
        at
    }

    /// Text up to the closing brace of an inline tag, wrapped in DESCRIPTION.
    fn description(&self, mut at: usize, nodes: &mut Vec<JNode>, _inline: bool) -> Result<usize> {
        let mut items = Vec::new();
        let mut text = None;
        let mut depth = 0usize;
        loop {
            let Some(tok) = self.toks.get(at) else {
                return Err(());
            };
            match tok.ch() {
                Some('}') if depth == 0 => break,
                Some('{') if self.ch(at + 1) == Some('@') => {
                    flush(&mut text, &mut items);
                    let (node, next) = self.inline_tag(at)?;
                    items.push(node);
                    at = next;
                    continue;
                }
                Some('<') if self.comment_at(at) => {
                    flush(&mut text, &mut items);
                    let (node, next) = self.html_comment(at)?;
                    items.push(node);
                    at = next;
                    continue;
                }
                Some('<') if self.start_tag_at(at) => {
                    flush(&mut text, &mut items);
                    let (node, trailing, next) = self.element(at)?;
                    items.push(node);
                    items.extend(trailing);
                    at = next;
                    continue;
                }
                Some(c) => {
                    if c == '{' {
                        depth += 1;
                    } else if c == '}' {
                        depth -= 1;
                    }
                    push_char(&mut text, tok, c);
                }
                None => {
                    flush(&mut text, &mut items);
                    items.push(tok.node());
                }
            }
            at += 1;
        }
        flush(&mut text, &mut items);
        let lead = items
            .iter()
            .take_while(|node| matches!(node.kind, "NEWLINE" | "LEADING_ASTERISK"))
            .count();
        let rest = items.split_off(lead);
        nodes.extend(items);
        if !rest.is_empty() {
            nodes.push(JNode::branch("DESCRIPTION", rest));
        }
        Ok(at)
    }
}
