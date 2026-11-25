//! The file as the ESLint rules see it: a generic table of ESTree nodes (typescript-eslint shape) read from
//! oxc's own ESTree output. Parentheses are not nodes here, every node knows its parent, and fields are
//! reached by name, so a rule written against ESTree translates line by line.
use std::borrow::Cow;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    /// A string as written in the JSON, with a flag for escapes still to undo.
    Text(u32, u32, bool),
    Node(u32),
    List(u32, u32),
}

struct NodeData {
    kind: (u32, u32),
    start: u32,
    end: u32,
    parent: u32,
    fields: (u32, u32),
}

struct Field {
    key: (u32, u32),
    value: Value,
}

pub struct View {
    json: String,
    nodes: Vec<NodeData>,
    fields: Vec<Field>,
    items: Vec<Value>,
}

const NONE: u32 = u32::MAX;

struct Reader<'j> {
    bytes: &'j [u8],
    at: usize,
    nodes: Vec<NodeData>,
    fields: Vec<Field>,
    items: Vec<Value>,
}

enum Frame {
    Object { index: u32, fields: Vec<Field>, key: Option<(u32, u32)> },
    List { items: Vec<Value> },
}

impl Reader<'_> {
    fn string(&mut self) -> (u32, u32, bool) {
        self.at += 1;
        let start = self.at;
        let mut escaped = false;
        while self.bytes[self.at] != b'"' {
            if self.bytes[self.at] == b'\\' {
                escaped = true;
                self.at += 1;
            }
            self.at += 1;
        }
        self.at += 1;
        (start as u32, (self.at - 1) as u32, escaped)
    }

    fn number(&mut self) -> f64 {
        let start = self.at;
        while self.at < self.bytes.len() && matches!(self.bytes[self.at], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') {
            self.at += 1;
        }
        std::str::from_utf8(&self.bytes[start..self.at]).ok().and_then(|text| text.parse().ok()).unwrap_or(f64::NAN)
    }

    fn finish_object(&mut self, index: u32, found: Vec<Field>) -> Value {
        let (kind_start, kind_end) = self.nodes[index as usize].kind;
        if &self.bytes[kind_start as usize..kind_end as usize] == b"ParenthesizedExpression" {
            self.nodes[index as usize].kind = (0, 0);
            return found.into_iter().map(|field| field.value).find(|value| matches!(value, Value::Node(_))).unwrap_or(Value::Null);
        }
        for field in &found {
            match field.value {
                Value::Node(child) => self.nodes[child as usize].parent = index,
                Value::List(start, end) => {
                    for item in start..end {
                        if let Value::Node(child) = self.items[item as usize] {
                            self.nodes[child as usize].parent = index;
                        }
                    }
                }
                _ => {}
            }
        }
        let start = self.fields.len() as u32;
        self.fields.extend(found);
        self.nodes[index as usize].fields = (start, self.fields.len() as u32);
        Value::Node(index)
    }

    fn parse(&mut self) {
        let mut stack: Vec<Frame> = Vec::new();
        loop {
            let mut value = match self.bytes[self.at] {
                b'{' => {
                    self.at += 1;
                    let index = self.nodes.len() as u32;
                    self.nodes.push(NodeData { kind: (0, 0), start: 0, end: 0, parent: NONE, fields: (0, 0) });
                    if self.bytes[self.at] == b'}' {
                        self.at += 1;
                        self.finish_object(index, Vec::new())
                    } else {
                        let (key_start, key_end, _) = self.string();
                        self.at += 1;
                        stack.push(Frame::Object { index, fields: Vec::new(), key: Some((key_start, key_end)) });
                        continue;
                    }
                }
                b'[' => {
                    self.at += 1;
                    if self.bytes[self.at] == b']' {
                        self.at += 1;
                        let start = self.items.len() as u32;
                        Value::List(start, start)
                    } else {
                        stack.push(Frame::List { items: Vec::new() });
                        continue;
                    }
                }
                b'"' => {
                    let (start, end, escaped) = self.string();
                    Value::Text(start, end, escaped)
                }
                b't' => { self.at += 4; Value::Bool(true) }
                b'f' => { self.at += 5; Value::Bool(false) }
                b'n' => { self.at += 4; Value::Null }
                _ => Value::Number(self.number()),
            };

            loop {
                let Some(top) = stack.last_mut() else {
                    return;
                };
                match top {
                    Frame::Object { index, fields, key } => {
                        let (key_start, key_end) = key.take().expect("object key");
                        let idx = *index as usize;
                        match (&self.bytes[key_start as usize..key_end as usize], value) {
                            (b"type", Value::Text(start, end, _)) => self.nodes[idx].kind = (start, end),
                            (b"start", Value::Number(offset)) => self.nodes[idx].start = offset as u32,
                            (b"end", Value::Number(offset)) => self.nodes[idx].end = offset as u32,
                            (b"range", _) => {}
                            _ => fields.push(Field { key: (key_start, key_end), value }),
                        }
                        if self.bytes[self.at] == b',' {
                            self.at += 1;
                            let (ks, ke, _) = self.string();
                            self.at += 1;
                            *key = Some((ks, ke));
                            break;
                        }
                        self.at += 1;
                        let Some(Frame::Object { index, fields, .. }) = stack.pop() else { unreachable!() };
                        value = self.finish_object(index, fields);
                    }
                    Frame::List { items } => {
                        items.push(value);
                        if self.bytes[self.at] == b',' {
                            self.at += 1;
                            break;
                        }
                        self.at += 1;
                        let Some(Frame::List { items }) = stack.pop() else { unreachable!() };
                        let start = self.items.len() as u32;
                        self.items.extend(items);
                        value = Value::List(start, self.items.len() as u32);
                    }
                }
            }
        }
    }
}

impl View {
    /// `json` is compact ESTree JSON as oxc writes it: no white space between tokens.
    pub fn of(json: String) -> View {
        let mut reader = Reader { bytes: json.as_bytes(), at: 0, nodes: Vec::new(), fields: Vec::new(), items: Vec::new() };
        reader.parse();
        let Reader { nodes, fields, items, .. } = reader;
        View { json, nodes, fields, items }
    }

    pub fn program(&self) -> Node<'_> {
        Node { view: self, index: 0 }
    }

    pub fn at(&self, index: u32) -> Node<'_> {
        Node { view: self, index }
    }

    /// Every node that has a type, in source order of their opening.
    pub fn nodes(&self) -> impl Iterator<Item = Node<'_>> {
        (0..self.nodes.len() as u32).map(|index| Node { view: self, index }).filter(|node| !node.kind().is_empty())
    }

    fn slice(&self, start: u32, end: u32) -> &str {
        &self.json[start as usize..end as usize]
    }

    pub fn text(&self, value: Value) -> Option<Cow<'_, str>> {
        match value {
            Value::Text(start, end, false) => Some(Cow::Borrowed(self.slice(start, end))),
            Value::Text(start, end, true) => {
                serde_json::from_str::<String>(&self.json[start as usize - 1..end as usize + 1]).ok().map(Cow::Owned)
            }
            _ => None,
        }
    }

    pub fn items(&self, value: Value) -> &[Value] {
        match value {
            Value::List(start, end) => &self.items[start as usize..end as usize],
            _ => &[],
        }
    }
}

#[derive(Clone, Copy)]
pub struct Node<'v> {
    pub view: &'v View,
    pub index: u32,
}

impl PartialEq for Node<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.index == other.index
    }
}

impl<'v> Node<'v> {
    fn data(&self) -> &'v NodeData {
        &self.view.nodes[self.index as usize]
    }

    pub fn kind(&self) -> &'v str {
        let (start, end) = self.data().kind;
        self.view.slice(start, end)
    }

    pub fn is(&self, kind: &str) -> bool {
        self.kind() == kind
    }

    pub fn start(&self) -> u32 {
        self.data().start
    }

    pub fn end(&self) -> u32 {
        self.data().end
    }

    pub fn parent(&self) -> Option<Node<'v>> {
        let parent = self.data().parent;
        (parent != NONE).then(|| self.view.at(parent))
    }

    pub fn ancestors(&self) -> impl Iterator<Item = Node<'v>> {
        std::iter::successors(self.parent(), Node::parent)
    }

    pub fn get(&self, key: &str) -> Value {
        let (start, end) = self.data().fields;
        self.view.fields[start as usize..end as usize]
            .iter()
            .find(|field| self.view.slice(field.key.0, field.key.1) == key)
            .map_or(Value::Null, |field| field.value)
    }

    pub fn has(&self, key: &str) -> bool {
        let (start, end) = self.data().fields;
        self.view.fields[start as usize..end as usize].iter().any(|field| self.view.slice(field.key.0, field.key.1) == key)
    }

    /// The field when it is a node with a type.
    pub fn node(&self, key: &str) -> Option<Node<'v>> {
        match self.get(key) {
            Value::Node(index) => Some(self.view.at(index)).filter(|node| !node.kind().is_empty()),
            _ => None,
        }
    }

    /// The field as a list; holes and nulls are `None`.
    pub fn list(&self, key: &str) -> Vec<Option<Node<'v>>> {
        self.view.items(self.get(key)).iter().map(|item| match item {
            Value::Node(index) => Some(self.view.at(*index)),
            _ => None,
        }).collect()
    }

    pub fn nodes(&self, key: &str) -> Vec<Node<'v>> {
        self.list(key).into_iter().flatten().collect()
    }

    pub fn text(&self, key: &str) -> Option<Cow<'v, str>> {
        self.view.text(self.get(key))
    }

    pub fn flag(&self, key: &str) -> bool {
        self.get(key) == Value::Bool(true)
    }

    /// `nodeChildren` of the ESLint helpers: every field that is a node, and the nodes of every list field.
    pub fn children(&self) -> Vec<Node<'v>> {
        let (start, end) = self.data().fields;
        let mut found = Vec::new();
        for field in &self.view.fields[start as usize..end as usize] {
            match field.value {
                Value::Node(index) => found.push(self.view.at(index)),
                Value::List(..) => found.extend(self.view.items(field.value).iter().filter_map(|item| match item {
                    Value::Node(index) => Some(self.view.at(*index)),
                    _ => None,
                })),
                _ => {}
            }
        }
        found.retain(|node| !node.kind().is_empty());
        found
    }

    /// The node and everything under it, parents before children.
    pub fn descendants(&self) -> Vec<Node<'v>> {
        let mut found = Vec::new();
        let mut stack = vec![*self];
        while let Some(node) = stack.pop() {
            found.push(node);
            stack.extend(node.children().into_iter().rev());
        }
        found
    }

    /// `nameOf` of the ESLint helpers: the `name` of any node that has one as a string.
    pub fn name(&self) -> Option<Cow<'v, str>> {
        self.text("name")
    }

    /// `contains` of the ESLint helpers: by range.
    pub fn contains(&self, other: Node) -> bool {
        self.start() <= other.start() && other.end() <= self.end()
    }
}
