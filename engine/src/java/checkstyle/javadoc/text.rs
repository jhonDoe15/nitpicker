use super::{JNode, Parser, Result, flush, push_char};

impl Parser<'_> {
    pub fn plain(&self, mut at: usize) -> Result<(Vec<JNode>, usize)> {
        let mut nodes = Vec::new();
        let mut text = None;
        while at < self.toks.len() && !self.html_at(at) && !self.block_tag_at(at) {
            if self.inline.get() > 0 && self.ch(at) == Some('}') {
                break;
            }
            let tok = &self.toks[at];
            match tok.ch() {
                None => {
                    flush(&mut text, &mut nodes);
                    nodes.push(tok.node());
                    at += 1;
                }
                Some('{') if self.ch(at + 1) == Some('@') => {
                    flush(&mut text, &mut nodes);
                    let (node, next) = self.inline_tag(at)?;
                    nodes.push(node);
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

    pub fn html_comment(&self, at: usize) -> Result<(JNode, usize)> {
        let start = JNode::leaf("HTML_COMMENT_START", &self.toks[at], "<!--".into());
        let mut index = at + 4;
        let mut inner = Vec::new();
        let mut text = None;
        loop {
            if index >= self.toks.len() {
                return Err(());
            }
            if (0..3).all(|offset| self.ch(index + offset) == "-->".chars().nth(offset)) {
                break;
            }
            let tok = &self.toks[index];
            match tok.ch() {
                Some(c) => push_char(&mut text, tok, c),
                None => {
                    flush(&mut text, &mut inner);
                    inner.push(tok.node());
                }
            }
            index += 1;
        }
        flush(&mut text, &mut inner);
        let mut nodes = vec![start];
        if !inner.is_empty() {
            nodes.push(JNode::branch("HTML_COMMENT_CONTENT", inner));
        }
        nodes.push(JNode::leaf(
            "HTML_COMMENT_END",
            &self.toks[index],
            "-->".into(),
        ));
        Ok((JNode::branch("HTML_COMMENT", nodes), index + 3))
    }
}
