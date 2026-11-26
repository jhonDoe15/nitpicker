use super::{JNode, Parser, Result, Stop, trimmed};

fn java_part(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '$' | '.')
}

impl Parser<'_> {
    fn blank_to_end(&self, index: usize) -> bool {
        self.toks[index..]
            .iter()
            .all(|tok| matches!(tok.ch(), None | Some(' ' | '\t' | '\u{c}')))
    }

    pub fn block_tag(&self, at: usize) -> Result<(JNode, Vec<JNode>, usize)> {
        let mut nodes = vec![JNode::leaf("AT_SIGN", &self.toks[at], "@".into())];
        let mut index = at + 1;
        let mut name = String::new();
        while let Some(c) = self
            .ch(index)
            .filter(|c| !c.is_whitespace() && !"({[<\"')]}".contains(*c))
        {
            name.push(c);
            index += 1;
        }
        if name.is_empty()
            || !name
                .chars()
                .all(|c| c.is_alphanumeric() || matches!(c, '.' | ':' | '-' | '_'))
        {
            return Err(());
        }
        nodes.push(JNode::leaf("TAG_NAME", &self.toks[at + 1], name.clone()));
        let bare =
            matches!(name.as_str(), "param" | "throws" | "exception") && self.blank_to_end(index);
        let kind = match name.as_str() {
            "param" if bare => "PARAM_BLOCK_TAG",
            "throws" if bare => "THROWS_BLOCK_TAG",
            "exception" if bare => "EXCEPTION_BLOCK_TAG",
            "param" => {
                index = self.spaces_into(index, &mut nodes);
                let start = index;
                let mut word = String::new();
                if self.ch(index) == Some('<') {
                    word.push('<');
                    index += 1;
                }
                while let Some(c) = self.ch(index).filter(|c| java_part(*c) && *c != '.') {
                    word.push(c);
                    index += 1;
                }
                if word.starts_with('<') {
                    if self.ch(index) != Some('>') {
                        return Err(());
                    }
                    word.push('>');
                    index += 1;
                }
                if word.is_empty() {
                    return Err(());
                }
                nodes.push(JNode::leaf("PARAMETER_NAME", &self.toks[start], word));
                "PARAM_BLOCK_TAG"
            }
            "throws" | "exception" => {
                index = self.spaces_into(index, &mut nodes);
                let start = index;
                let mut word = String::new();
                while let Some(c) = self.ch(index).filter(|c| java_part(*c)) {
                    word.push(c);
                    index += 1;
                }
                if word.is_empty() {
                    return Err(());
                }
                nodes.push(JNode::leaf("IDENTIFIER", &self.toks[start], word));
                if name == "throws" {
                    "THROWS_BLOCK_TAG"
                } else {
                    "EXCEPTION_BLOCK_TAG"
                }
            }
            "see" => {
                index = self.spaces_into(index, &mut nodes);
                if self.ch(index) == Some('"') {
                    let start = index;
                    let mut literal = String::from('"');
                    index += 1;
                    loop {
                        match self.ch(index) {
                            Some('"') => break,
                            Some(c) => literal.push(c),
                            None => return Err(()),
                        }
                        index += 1;
                    }
                    literal.push('"');
                    nodes.push(JNode::leaf("STRING_LITERAL", &self.toks[start], literal));
                    let (rest, next) = self.content(index + 1, Stop::Block)?;
                    let (lead, middle, mut tail) = trimmed(rest);
                    if !middle.is_empty() {
                        return Err(());
                    }
                    tail.splice(0..0, lead);
                    let tag = JNode::branch("SEE_BLOCK_TAG", nodes);
                    return Ok((JNode::branch("JAVADOC_BLOCK_TAG", vec![tag]), tail, next));
                }
                if self.start_tag_at(index) {
                    let (line, col) = (self.toks[index].line, self.toks[index].col);
                    let (element, trailing, next) = self.element(index)?;
                    nodes.push(element);
                    nodes.extend(trailing);
                    let (rest, after) = self.content(next, Stop::Block)?;
                    let (lead, middle, mut tail) = trimmed(rest);
                    if middle.is_empty() {
                        tail.splice(0..0, lead);
                    } else {
                        nodes.extend(lead);
                        nodes.push(JNode::branch("DESCRIPTION", middle));
                    }
                    let mut tag = JNode::branch("SEE_BLOCK_TAG", nodes);
                    shift(&mut tag, line, col);
                    for node in &mut tail {
                        shift(node, line, col);
                    }
                    return Ok((JNode::branch("JAVADOC_BLOCK_TAG", vec![tag]), tail, after));
                }
                let (reference, next) = self.reference(index)?;
                nodes.push(reference);
                index = next;
                "SEE_BLOCK_TAG"
            }
            "return" => "RETURN_BLOCK_TAG",
            "author" => "AUTHOR_BLOCK_TAG",
            "since" => "SINCE_BLOCK_TAG",
            "version" => "VERSION_BLOCK_TAG",
            "deprecated" => "DEPRECATED_BLOCK_TAG",
            "serial" => "SERIAL_BLOCK_TAG",
            "serialData" => "SERIAL_DATA_BLOCK_TAG",
            "serialField" => "SERIAL_FIELD_BLOCK_TAG",
            _ => "CUSTOM_BLOCK_TAG",
        };
        let (rest, next) = self.content(index, Stop::Block)?;
        let (lead, middle, mut tail) = trimmed(rest);
        if middle.is_empty() {
            tail.splice(0..0, lead);
        } else {
            nodes.extend(lead);
            nodes.push(JNode::branch("DESCRIPTION", middle));
        }
        let tag = JNode::branch(kind, nodes);
        Ok((JNode::branch("JAVADOC_BLOCK_TAG", vec![tag]), tail, next))
    }

    pub fn reference(&self, at: usize) -> Result<(JNode, usize)> {
        let mut nodes = Vec::new();
        let mut index = at;
        let (name, next) = self.java_name(index);
        if !name.is_empty() {
            nodes.push(JNode::leaf("IDENTIFIER", &self.toks[index], name));
            index = next;
            if self.ch(index) == Some('<') {
                let (arguments, next) = self.type_arguments(index)?;
                nodes.push(arguments);
                index = next;
            }
        }
        if self.ch(index) == Some('#') {
            nodes.push(JNode::leaf("HASH", &self.toks[index], "#".into()));
            index += 1;
            let (member, next) = self.java_name(index);
            if member.is_empty() {
                return Err(());
            }
            let mut parts = vec![JNode::leaf("IDENTIFIER", &self.toks[index], member)];
            index = next;
            if self.ch(index) == Some('(') {
                parts.push(JNode::leaf("LPAREN", &self.toks[index], "(".into()));
                index = self.spaces_into(index + 1, &mut parts);
                let mut list = Vec::new();
                loop {
                    let start = index;
                    let mut kind = String::new();
                    while let Some(c) = self
                        .ch(index)
                        .filter(|c| java_part(*c) || matches!(c, '[' | ']'))
                    {
                        kind.push(c);
                        index += 1;
                    }
                    let named = !kind.is_empty();
                    if named {
                        list.push(JNode::leaf("PARAMETER_TYPE", &self.toks[start], kind));
                    }
                    match self.ch(index) {
                        Some(')') => break,
                        Some(',') => {
                            list.push(JNode::leaf("COMMA", &self.toks[index], ",".into()));
                            index = self.spaces_into(index + 1, &mut list);
                        }
                        Some(' ' | '\t') if named => index = self.spaces_into(index, &mut list),
                        _ => return Err(()),
                    }
                }
                if !list.is_empty() {
                    parts.push(JNode::branch("PARAMETER_TYPE_LIST", list));
                }
                parts.push(JNode::leaf("RPAREN", &self.toks[index], ")".into()));
                index += 1;
            }
            nodes.push(JNode::branch("MEMBER_REFERENCE", parts));
        }
        if nodes.is_empty()
            || self
                .ch(index)
                .is_some_and(|c| !c.is_whitespace() && c != '}')
        {
            return Err(());
        }
        Ok((JNode::branch("REFERENCE", nodes), index))
    }

    fn java_name(&self, mut at: usize) -> (String, usize) {
        let mut name = String::new();
        while let Some(c) = self.ch(at).filter(|c| java_part(*c)) {
            name.push(c);
            at += 1;
        }
        (name, at)
    }

    fn type_arguments(&self, at: usize) -> Result<(JNode, usize)> {
        let mut nodes = vec![JNode::leaf("LT", &self.toks[at], "<".into())];
        let mut index = at + 1;
        loop {
            let (name, next) = self.java_name(index);
            if name.is_empty() {
                return Err(());
            }
            let argument = JNode::leaf("IDENTIFIER", &self.toks[index], name);
            nodes.push(JNode::branch("TYPE_ARGUMENT", vec![argument]));
            index = next;
            match self.ch(index) {
                Some('>') => break,
                Some(',') => {
                    nodes.push(JNode::leaf("COMMA", &self.toks[index], ",".into()));
                    index = self.spaces_into(index + 1, &mut nodes);
                }
                _ => return Err(()),
            }
        }
        nodes.push(JNode::leaf("GT", &self.toks[index], ">".into()));
        Ok((JNode::branch("TYPE_ARGUMENTS", nodes), index + 1))
    }
}

fn shift(node: &mut JNode, line: usize, col: usize) {
    if node.line == line && node.col >= col {
        node.col += 1;
    }
    for child in &mut node.children {
        shift(child, line, col);
    }
}
