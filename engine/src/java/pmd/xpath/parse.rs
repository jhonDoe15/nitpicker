//! Parser for the XPath 3.1 expressions of PMD rules.
use std::rc::Rc;

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Int(i64),
    Real(f64),
    Text(String),
    Name(String),
    Sym(&'static str),
    End,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Axis {
    Child,
    Descendant,
    DescendantOrSelf,
    Parent,
    Ancestor,
    AncestorOrSelf,
    FollowingSibling,
    PrecedingSibling,
    Following,
    Preceding,
    Attribute,
    Own,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Test {
    /// `node()`.
    Any,
    /// `*`: an element, or any attribute on the attribute axis.
    Wild,
    Named(Rc<str>),
    /// `text()` and the like: nothing in a PMD tree.
    Nothing,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Cmp {
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Order {
    Same,
    Before,
    After,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Math {
    Add,
    Sub,
    Mul,
    Div,
    WholeDiv,
    Rest,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Sets {
    Union,
    Intersect,
    Except,
}

#[derive(Debug)]
pub enum Key {
    Name(Rc<str>),
    Whole(i64),
    All,
    Computed(Box<Expr>),
}

#[derive(Debug)]
pub struct Lambda {
    pub parameters: Vec<u32>,
    pub body: Expr,
}

#[derive(Debug)]
pub enum Expr {
    Sequence(Vec<Expr>),
    /// A sequence of literals, built once.
    Fixed(super::value::Seq),
    Whole(i64),
    Real(f64),
    Text(Rc<str>),
    Variable(u32),
    Context,
    Root,
    Path(Box<Expr>, Box<Expr>),
    Step(Axis, Test, Vec<Expr>),
    Filter(Box<Expr>, Box<Expr>),
    Call(Rc<str>, Vec<Expr>),
    Dynamic(Box<Expr>, Vec<Expr>),
    Inline(Rc<Lambda>),
    Reference(Rc<str>, usize),
    Map(Vec<(Expr, Expr)>),
    Array(Vec<Expr>),
    Lookup(Box<Expr>, Key),
    OwnLookup(Key),
    For(u32, Box<Expr>, Box<Expr>),
    Let(u32, Box<Expr>, Box<Expr>),
    Quantified(bool, u32, Box<Expr>, Box<Expr>),
    If(Box<Expr>, Box<Expr>, Box<Expr>),
    Or(Box<Expr>, Box<Expr>),
    And(Box<Expr>, Box<Expr>),
    General(Cmp, Box<Expr>, Box<Expr>),
    Single(Cmp, Box<Expr>, Box<Expr>),
    Nodes(Order, Box<Expr>, Box<Expr>),
    Concat(Box<Expr>, Box<Expr>),
    Range(Box<Expr>, Box<Expr>),
    Math(Math, Box<Expr>, Box<Expr>),
    Negate(Box<Expr>),
    Sets(Sets, Box<Expr>, Box<Expr>),
    Each(Box<Expr>, Box<Expr>),
}

const SYMBOLS: &[&str] = &[
    "//", "||", "!=", "<=", ">=", "<<", ">>", "::", ":=", "=>", "..", "(", ")", "[", "]", "{", "}", ",", "/", "|", "!", "=", "<", ">", "+", "-",
    "*", "@", ".", "$", "?", "#", ":",
];

/// Whether a predicate can only be true or false, never a position.
fn yes_or_no(predicate: &Expr) -> bool {
    match predicate {
        Expr::Or(left, right) | Expr::And(left, right) => yes_or_no(left) && yes_or_no(right),
        Expr::General(..) | Expr::Single(..) | Expr::Nodes(..) | Expr::Quantified(..) | Expr::Step(..) | Expr::Path(..) | Expr::Sets(..) => true,
        Expr::Filter(base, _) => matches!(base.as_ref(), Expr::Step(..) | Expr::Path(..) | Expr::Sets(..) | Expr::Context),
        Expr::Call(name, _) => matches!(
            name.as_ref(),
            "not" | "exists" | "empty" | "starts-with" | "ends-with" | "contains" | "matches" | "boolean" | "true" | "false"
                | "pmd-java:typeIs" | "pmd-java:typeIsExactly" | "pmd-java:matchesSig" | "pmd-java:hasAnnotation" | "pmd-java:nodeIs"
        ),
        _ => false,
    }
}

/// A step over children, or a union of such steps, turned into the same step over all descendants.
fn deepened(step: Expr, allowed: bool) -> Result<Expr, Expr> {
    if !allowed {
        return Err(step);
    }
    match step {
        Expr::Step(Axis::Child, test, predicates) if predicates.iter().all(yes_or_no) => Ok(Expr::Step(Axis::Descendant, test, predicates)),
        Expr::Filter(base, predicate) if yes_or_no(&predicate) => match deepened(*base, true) {
            Ok(base) => Ok(Expr::Filter(boxed(base), predicate)),
            Err(base) => Err(Expr::Filter(boxed(base), predicate)),
        },
        Expr::Sets(Sets::Union, left, right) => match (deepened(*left, true), deepened(*right, true)) {
            (Ok(left), Ok(right)) => Ok(Expr::Sets(Sets::Union, boxed(left), boxed(right))),
            (Ok(left), Err(right)) => Err(Expr::Sets(Sets::Union, boxed(shallow(left)), boxed(right))),
            (Err(left), Ok(right)) => Err(Expr::Sets(Sets::Union, boxed(left), boxed(shallow(right)))),
            (Err(left), Err(right)) => Err(Expr::Sets(Sets::Union, boxed(left), boxed(right))),
        },
        other => Err(other),
    }
}

/// Undoes `deepened` for a part of a union whose other part could not be turned.
fn shallow(step: Expr) -> Expr {
    match step {
        Expr::Step(Axis::Descendant, test, predicates) => Expr::Step(Axis::Child, test, predicates),
        Expr::Filter(base, predicate) => Expr::Filter(boxed(shallow(*base)), predicate),
        Expr::Sets(kind, left, right) => Expr::Sets(kind, boxed(shallow(*left)), boxed(shallow(*right))),
        other => other,
    }
}

fn lex(source: &str) -> Result<Vec<Tok>, String> {
    let chars: Vec<char> = source.chars().collect();
    let mut tokens = Vec::new();
    let mut at = 0;
    let starts_name = |c: char| c.is_alphabetic() || c == '_';
    let in_name = |c: char| c.is_alphanumeric() || matches!(c, '_' | '-' | '.');
    while at < chars.len() {
        let c = chars[at];
        if c.is_whitespace() {
            at += 1;
        } else if c == '(' && chars.get(at + 1) == Some(&':') {
            let mut depth = 1;
            at += 2;
            while at < chars.len() && depth > 0 {
                if chars[at] == '(' && chars.get(at + 1) == Some(&':') {
                    depth += 1;
                    at += 2;
                } else if chars[at] == ':' && chars.get(at + 1) == Some(&')') {
                    depth -= 1;
                    at += 2;
                } else {
                    at += 1;
                }
            }
        } else if c.is_ascii_digit() || (c == '.' && chars.get(at + 1).is_some_and(char::is_ascii_digit)) {
            let start = at;
            while at < chars.len() && chars[at].is_ascii_digit() {
                at += 1;
            }
            let mut real = false;
            if chars.get(at) == Some(&'.') && chars.get(at + 1) != Some(&'.') {
                real = true;
                at += 1;
                while at < chars.len() && chars[at].is_ascii_digit() {
                    at += 1;
                }
            }
            if matches!(chars.get(at), Some('e' | 'E'))
                && (chars.get(at + 1).is_some_and(char::is_ascii_digit)
                    || (matches!(chars.get(at + 1), Some('+' | '-')) && chars.get(at + 2).is_some_and(char::is_ascii_digit)))
            {
                real = true;
                at += 2;
                while at < chars.len() && chars[at].is_ascii_digit() {
                    at += 1;
                }
            }
            let written: String = chars[start..at].iter().collect();
            tokens.push(if real {
                Tok::Real(written.parse().map_err(|_| format!("number {written}"))?)
            } else {
                Tok::Int(written.parse().map_err(|_| format!("number {written}"))?)
            });
        } else if c == '"' || c == '\'' {
            let mut value = String::new();
            at += 1;
            loop {
                match chars.get(at) {
                    None => return Err("string without end".to_string()),
                    Some(&next) if next == c => {
                        if chars.get(at + 1) == Some(&c) {
                            value.push(c);
                            at += 2;
                        } else {
                            at += 1;
                            break;
                        }
                    }
                    Some(&next) => {
                        value.push(next);
                        at += 1;
                    }
                }
            }
            tokens.push(Tok::Text(value));
        } else if starts_name(c) || (c == '*' && chars.get(at + 1) == Some(&':') && chars.get(at + 2).copied().is_some_and(starts_name)) {
            let start = at;
            if c == '*' {
                at += 2;
            }
            while at < chars.len() && in_name(chars[at]) {
                at += 1;
            }
            while at > start + 1 && matches!(chars[at - 1], '-' | '.') {
                at -= 1;
            }
            if c != '*' && chars.get(at) == Some(&':') && chars.get(at + 1).copied().is_some_and(|next| starts_name(next) || next == '*') {
                at += 1;
                if chars[at] == '*' {
                    at += 1;
                } else {
                    while at < chars.len() && in_name(chars[at]) {
                        at += 1;
                    }
                    while matches!(chars[at - 1], '-' | '.') {
                        at -= 1;
                    }
                }
            }
            tokens.push(Tok::Name(chars[start..at].iter().collect()));
        } else {
            let rest: String = chars[at..(at + 2).min(chars.len())].iter().collect();
            let Some(symbol) = SYMBOLS.iter().find(|symbol| rest.starts_with(**symbol)) else {
                return Err(format!("unexpected character {c}"));
            };
            tokens.push(Tok::Sym(symbol));
            at += symbol.len();
        }
    }
    tokens.push(Tok::End);
    Ok(tokens)
}

pub struct Parser {
    tokens: Vec<Tok>,
    at: usize,
    pub names: Vec<String>,
}

type Parsed = Result<Expr, String>;

fn boxed(expr: Expr) -> Box<Expr> {
    Box::new(expr)
}

impl Parser {
    pub fn parse(source: &str, names: Vec<String>) -> Result<(Expr, Vec<String>), String> {
        let mut parser = Parser { tokens: lex(source)?, at: 0, names };
        let expr = parser.expr()?;
        if parser.peek() != &Tok::End {
            return Err(format!("unexpected {:?} at token {}", parser.peek(), parser.at));
        }
        Ok((expr, parser.names))
    }

    fn peek(&self) -> &Tok {
        &self.tokens[self.at]
    }

    fn ahead(&self, by: usize) -> &Tok {
        self.tokens.get(self.at + by).unwrap_or(&Tok::End)
    }

    fn sym(&self, symbol: &str) -> bool {
        matches!(self.peek(), Tok::Sym(found) if *found == symbol)
    }

    fn word(&self, word: &str) -> bool {
        matches!(self.peek(), Tok::Name(found) if found == word)
    }

    fn take(&mut self, symbol: &str) -> bool {
        let found = self.sym(symbol);
        self.at += usize::from(found);
        found
    }

    fn take_word(&mut self, word: &str) -> bool {
        let found = self.word(word);
        self.at += usize::from(found);
        found
    }

    fn expect(&mut self, symbol: &str) -> Result<(), String> {
        if self.take(symbol) { Ok(()) } else { Err(format!("expected {symbol}, found {:?} at token {}", self.peek(), self.at)) }
    }

    fn expect_word(&mut self, word: &str) -> Result<(), String> {
        if self.take_word(word) { Ok(()) } else { Err(format!("expected {word}, found {:?} at token {}", self.peek(), self.at)) }
    }

    fn name(&mut self) -> Result<String, String> {
        match self.peek().clone() {
            Tok::Name(name) => {
                self.at += 1;
                Ok(name)
            }
            other => Err(format!("expected a name, found {other:?} at token {}", self.at)),
        }
    }

    fn variable(&mut self) -> Result<u32, String> {
        self.expect("$")?;
        let name = self.name()?;
        Ok(self.intern(&name))
    }

    pub fn intern(&mut self, name: &str) -> u32 {
        if let Some(found) = self.names.iter().position(|known| known == name) {
            return found as u32;
        }
        self.names.push(name.to_string());
        self.names.len() as u32 - 1
    }

    fn expr(&mut self) -> Parsed {
        let first = self.single()?;
        if !self.sym(",") {
            return Ok(first);
        }
        let mut all = vec![first];
        while self.take(",") {
            all.push(self.single()?);
        }
        let literal = |part: &Expr| match part {
            Expr::Text(text) => Some(super::value::Item::Text(text.clone())),
            Expr::Whole(whole) => Some(super::value::Item::Whole(*whole)),
            _ => None,
        };
        match all.iter().map(literal).collect::<Option<Vec<_>>>() {
            Some(items) => Ok(Expr::Fixed(super::value::Seq::from(items))),
            None => Ok(Expr::Sequence(all)),
        }
    }

    fn single(&mut self) -> Parsed {
        let bound = matches!(self.ahead(1), Tok::Sym("$"));
        if bound && (self.word("for") || self.word("let")) {
            let each = self.word("for");
            self.at += 1;
            let mut bindings = Vec::new();
            loop {
                let name = self.variable()?;
                if each {
                    self.expect_word("in")?;
                } else {
                    self.expect(":=")?;
                }
                bindings.push((name, self.single()?));
                if !self.take(",") {
                    break;
                }
            }
            self.expect_word("return")?;
            let mut body = self.single()?;
            for (name, value) in bindings.into_iter().rev() {
                body = if each { Expr::For(name, boxed(value), boxed(body)) } else { Expr::Let(name, boxed(value), boxed(body)) };
            }
            return Ok(body);
        }
        if bound && (self.word("some") || self.word("every")) {
            let every = self.word("every");
            self.at += 1;
            let mut bindings = Vec::new();
            loop {
                let name = self.variable()?;
                self.expect_word("in")?;
                bindings.push((name, self.single()?));
                if !self.take(",") {
                    break;
                }
            }
            self.expect_word("satisfies")?;
            let mut body = self.single()?;
            for (name, value) in bindings.into_iter().rev() {
                body = Expr::Quantified(every, name, boxed(value), boxed(body));
            }
            return Ok(body);
        }
        if self.word("if") && matches!(self.ahead(1), Tok::Sym("(")) {
            self.at += 2;
            let condition = self.expr()?;
            self.expect(")")?;
            self.expect_word("then")?;
            let then = self.single()?;
            self.expect_word("else")?;
            let otherwise = self.single()?;
            return Ok(Expr::If(boxed(condition), boxed(then), boxed(otherwise)));
        }
        self.or()
    }

    fn or(&mut self) -> Parsed {
        let mut left = self.and()?;
        while self.take_word("or") {
            left = Expr::Or(boxed(left), boxed(self.and()?));
        }
        Ok(left)
    }

    fn and(&mut self) -> Parsed {
        let mut left = self.comparison()?;
        while self.take_word("and") {
            left = Expr::And(boxed(left), boxed(self.comparison()?));
        }
        Ok(left)
    }

    fn comparison(&mut self) -> Parsed {
        let left = self.concat()?;
        let general = match self.peek() {
            Tok::Sym("=") => Some(Cmp::Eq),
            Tok::Sym("!=") => Some(Cmp::Ne),
            Tok::Sym("<") => Some(Cmp::Lt),
            Tok::Sym("<=") => Some(Cmp::Le),
            Tok::Sym(">") => Some(Cmp::Gt),
            Tok::Sym(">=") => Some(Cmp::Ge),
            _ => None,
        };
        if let Some(cmp) = general {
            self.at += 1;
            return Ok(Expr::General(cmp, boxed(left), boxed(self.concat()?)));
        }
        let single = match self.peek() {
            Tok::Name(word) => match word.as_str() {
                "eq" => Some(Cmp::Eq),
                "ne" => Some(Cmp::Ne),
                "lt" => Some(Cmp::Lt),
                "le" => Some(Cmp::Le),
                "gt" => Some(Cmp::Gt),
                "ge" => Some(Cmp::Ge),
                _ => None,
            },
            _ => None,
        };
        if let Some(cmp) = single {
            self.at += 1;
            return Ok(Expr::Single(cmp, boxed(left), boxed(self.concat()?)));
        }
        let order = match self.peek() {
            Tok::Name(word) if word == "is" => Some(Order::Same),
            Tok::Sym("<<") => Some(Order::Before),
            Tok::Sym(">>") => Some(Order::After),
            _ => None,
        };
        if let Some(order) = order {
            self.at += 1;
            return Ok(Expr::Nodes(order, boxed(left), boxed(self.concat()?)));
        }
        Ok(left)
    }

    fn concat(&mut self) -> Parsed {
        let mut left = self.range()?;
        while self.take("||") {
            left = Expr::Concat(boxed(left), boxed(self.range()?));
        }
        Ok(left)
    }

    fn range(&mut self) -> Parsed {
        let left = self.additive()?;
        if self.take_word("to") {
            return Ok(Expr::Range(boxed(left), boxed(self.additive()?)));
        }
        Ok(left)
    }

    fn additive(&mut self) -> Parsed {
        let mut left = self.multiplicative()?;
        loop {
            let op = if self.take("+") {
                Math::Add
            } else if self.take("-") {
                Math::Sub
            } else {
                return Ok(left);
            };
            left = Expr::Math(op, boxed(left), boxed(self.multiplicative()?));
        }
    }

    fn multiplicative(&mut self) -> Parsed {
        let mut left = self.union()?;
        loop {
            let op = if self.take("*") {
                Math::Mul
            } else if self.take_word("div") {
                Math::Div
            } else if self.take_word("idiv") {
                Math::WholeDiv
            } else if self.take_word("mod") {
                Math::Rest
            } else {
                return Ok(left);
            };
            left = Expr::Math(op, boxed(left), boxed(self.union()?));
        }
    }

    fn union(&mut self) -> Parsed {
        let mut left = self.intersect()?;
        while self.take("|") || self.take_word("union") {
            left = Expr::Sets(Sets::Union, boxed(left), boxed(self.intersect()?));
        }
        Ok(left)
    }

    fn intersect(&mut self) -> Parsed {
        let mut left = self.unary()?;
        loop {
            let op = if self.take_word("intersect") {
                Sets::Intersect
            } else if self.take_word("except") {
                Sets::Except
            } else {
                return Ok(left);
            };
            left = Expr::Sets(op, boxed(left), boxed(self.unary()?));
        }
    }

    fn unary(&mut self) -> Parsed {
        if self.take("-") {
            return Ok(Expr::Negate(boxed(self.unary()?)));
        }
        if self.take("+") {
            return self.unary();
        }
        let mut left = self.path()?;
        while self.take("!") {
            left = Expr::Each(boxed(left), boxed(self.path()?));
        }
        Ok(left)
    }

    fn starts_step(&self) -> bool {
        match self.peek() {
            Tok::Name(word) => !matches!(
                word.as_str(),
                "or" | "and" | "div" | "idiv" | "mod" | "to" | "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "is" | "union" | "intersect" | "except"
                    | "return" | "satisfies" | "then" | "else" | "in"
            ) || matches!(self.ahead(1), Tok::Sym("(" | "::")),
            Tok::Int(_) | Tok::Real(_) | Tok::Text(_) => true,
            Tok::Sym(symbol) => matches!(*symbol, "(" | "@" | "." | ".." | "$" | "*" | "?" | "["),
            Tok::End => false,
        }
    }

    fn path(&mut self) -> Parsed {
        let mut left = if self.take("/") {
            if !self.starts_step() {
                return Ok(Expr::Root);
            }
            Expr::Path(boxed(Expr::Root), boxed(self.step()?))
        } else if self.take("//") {
            self.below(Expr::Root)?
        } else {
            self.step()?
        };
        loop {
            if self.take("/") {
                left = Expr::Path(boxed(left), boxed(self.step()?));
            } else if self.take("//") {
                left = self.below(left)?;
            } else {
                return Ok(left);
            }
        }
    }

    /// `left//step`. When the step looks at children and no predicate of it depends on a position,
    /// it is the same as `left/descendant::step`, which the tree answers from its index of node names.
    fn below(&mut self, left: Expr) -> Parsed {
        let from = self.at;
        let step = self.step()?;
        let positional = self.tokens[from..self.at].iter().any(|token| matches!(token, Tok::Name(name) if name == "position" || name == "last"));
        match deepened(step, !positional) {
            Ok(direct) => Ok(Expr::Path(boxed(left), boxed(direct))),
            Err(step) => {
                let all = Expr::Path(boxed(left), boxed(Expr::Step(Axis::DescendantOrSelf, Test::Any, Vec::new())));
                Ok(Expr::Path(boxed(all), boxed(step)))
            }
        }
    }

    fn predicates(&mut self) -> Result<Vec<Expr>, String> {
        let mut all = Vec::new();
        while self.take("[") {
            all.push(self.expr()?);
            self.expect("]")?;
        }
        Ok(all)
    }

    fn test(&mut self) -> Result<Test, String> {
        if self.take("*") {
            return Ok(Test::Wild);
        }
        let name = self.name()?;
        if self.sym("(") && matches!(name.as_str(), "node" | "text" | "element" | "attribute" | "comment" | "processing-instruction" | "document-node") {
            self.at += 1;
            let inner = if self.sym(")") { None } else { Some(self.test()?) };
            self.expect(")")?;
            return Ok(match (name.as_str(), inner) {
                ("node", _) => Test::Any,
                ("element" | "attribute", None) => Test::Wild,
                ("element" | "attribute", Some(inner)) => inner,
                _ => Test::Nothing,
            });
        }
        Ok(if name == "*:*" { Test::Wild } else { Test::Named(Rc::from(name.as_str())) })
    }

    fn step(&mut self) -> Parsed {
        if self.take("..") {
            let predicates = self.predicates()?;
            return Ok(Expr::Step(Axis::Parent, Test::Any, predicates));
        }
        if self.take("@") {
            let test = self.test()?;
            let predicates = self.predicates()?;
            return Ok(Expr::Step(Axis::Attribute, test, predicates));
        }
        if let (Tok::Name(axis), Tok::Sym("::")) = (self.peek().clone(), self.ahead(1).clone()) {
            let axis = match axis.as_str() {
                "child" => Axis::Child,
                "descendant" => Axis::Descendant,
                "descendant-or-self" => Axis::DescendantOrSelf,
                "parent" => Axis::Parent,
                "ancestor" => Axis::Ancestor,
                "ancestor-or-self" => Axis::AncestorOrSelf,
                "following-sibling" => Axis::FollowingSibling,
                "preceding-sibling" => Axis::PrecedingSibling,
                "following" => Axis::Following,
                "preceding" => Axis::Preceding,
                "attribute" => Axis::Attribute,
                "self" => Axis::Own,
                other => return Err(format!("unknown axis {other}")),
            };
            self.at += 2;
            let test = self.test()?;
            let predicates = self.predicates()?;
            return Ok(Expr::Step(axis, test, predicates));
        }
        let primary = match self.peek().clone() {
            Tok::Sym("*") => None,
            Tok::Name(name) => {
                let called = matches!(self.ahead(1), Tok::Sym("("));
                let kind = matches!(name.as_str(), "node" | "text" | "element" | "attribute" | "comment" | "processing-instruction" | "document-node");
                let built = matches!(self.ahead(1), Tok::Sym("{")) && matches!(name.as_str(), "map" | "array");
                let reference = matches!(self.ahead(1), Tok::Sym("#"));
                if (called && !kind) || built || reference { Some(self.primary()?) } else { None }
            }
            _ => Some(self.primary()?),
        };
        let Some(mut base) = primary else {
            let test = self.test()?;
            let predicates = self.predicates()?;
            return Ok(Expr::Step(Axis::Child, test, predicates));
        };
        loop {
            if self.take("[") {
                let predicate = self.expr()?;
                self.expect("]")?;
                base = Expr::Filter(boxed(base), boxed(predicate));
            } else if self.sym("(") {
                let arguments = self.arguments()?;
                base = Expr::Dynamic(boxed(base), arguments);
            } else if self.sym("?") {
                self.at += 1;
                let key = self.key()?;
                base = Expr::Lookup(boxed(base), key);
            } else {
                return Ok(base);
            }
        }
    }

    fn key(&mut self) -> Result<Key, String> {
        match self.peek().clone() {
            Tok::Name(name) => {
                self.at += 1;
                Ok(Key::Name(Rc::from(name.as_str())))
            }
            Tok::Int(whole) => {
                self.at += 1;
                Ok(Key::Whole(whole))
            }
            Tok::Sym("*") => {
                self.at += 1;
                Ok(Key::All)
            }
            Tok::Sym("(") => {
                self.at += 1;
                let inner = if self.sym(")") { Expr::Sequence(Vec::new()) } else { self.expr()? };
                self.expect(")")?;
                Ok(Key::Computed(boxed(inner)))
            }
            other => Err(format!("bad lookup key {other:?}")),
        }
    }

    fn arguments(&mut self) -> Result<Vec<Expr>, String> {
        self.expect("(")?;
        let mut all = Vec::new();
        if !self.sym(")") {
            loop {
                all.push(self.single()?);
                if !self.take(",") {
                    break;
                }
            }
        }
        self.expect(")")?;
        Ok(all)
    }

    fn primary(&mut self) -> Parsed {
        match self.peek().clone() {
            Tok::Int(whole) => {
                self.at += 1;
                Ok(Expr::Whole(whole))
            }
            Tok::Real(real) => {
                self.at += 1;
                Ok(Expr::Real(real))
            }
            Tok::Text(text) => {
                self.at += 1;
                Ok(Expr::Text(Rc::from(text.as_str())))
            }
            Tok::Sym("$") => Ok(Expr::Variable(self.variable()?)),
            Tok::Sym("(") => {
                self.at += 1;
                if self.take(")") {
                    return Ok(Expr::Sequence(Vec::new()));
                }
                let inner = self.expr()?;
                self.expect(")")?;
                Ok(inner)
            }
            Tok::Sym(".") => {
                self.at += 1;
                Ok(Expr::Context)
            }
            Tok::Sym("?") => {
                self.at += 1;
                Ok(Expr::OwnLookup(self.key()?))
            }
            Tok::Sym("[") => {
                self.at += 1;
                let mut members = Vec::new();
                if !self.sym("]") {
                    loop {
                        members.push(self.single()?);
                        if !self.take(",") {
                            break;
                        }
                    }
                }
                self.expect("]")?;
                Ok(Expr::Array(members))
            }
            Tok::Name(name) => {
                self.at += 1;
                if name == "function" && self.sym("(") {
                    self.at += 1;
                    let mut parameters = Vec::new();
                    if !self.sym(")") {
                        loop {
                            parameters.push(self.variable()?);
                            if self.take_word("as") {
                                self.sequence_type()?;
                            }
                            if !self.take(",") {
                                break;
                            }
                        }
                    }
                    self.expect(")")?;
                    if self.take_word("as") {
                        self.sequence_type()?;
                    }
                    self.expect("{")?;
                    let body = if self.sym("}") { Expr::Sequence(Vec::new()) } else { self.expr()? };
                    self.expect("}")?;
                    return Ok(Expr::Inline(Rc::new(Lambda { parameters, body })));
                }
                if name == "map" && self.take("{") {
                    let mut entries = Vec::new();
                    if !self.sym("}") {
                        loop {
                            let key = self.single()?;
                            self.expect(":")?;
                            entries.push((key, self.single()?));
                            if !self.take(",") {
                                break;
                            }
                        }
                    }
                    self.expect("}")?;
                    return Ok(Expr::Map(entries));
                }
                if name == "array" && self.take("{") {
                    let inner = if self.sym("}") { Expr::Sequence(Vec::new()) } else { self.expr()? };
                    self.expect("}")?;
                    return Ok(Expr::Call(Rc::from("array:of"), vec![inner]));
                }
                if self.take("#") {
                    let Tok::Int(arity) = self.peek().clone() else { return Err("expected an arity".to_string()) };
                    self.at += 1;
                    return Ok(Expr::Reference(Rc::from(name.trim_start_matches("fn:")), arity as usize));
                }
                let arguments = self.arguments()?;
                Ok(Expr::Call(Rc::from(name.trim_start_matches("fn:")), arguments))
            }
            other => Err(format!("unexpected {other:?} at token {}", self.at)),
        }
    }

    /// Reads over a declared type; types are not checked.
    fn sequence_type(&mut self) -> Result<(), String> {
        self.name()?;
        if self.take("(") {
            let mut depth = 1;
            while depth > 0 {
                match self.peek() {
                    Tok::Sym("(") => depth += 1,
                    Tok::Sym(")") => depth -= 1,
                    Tok::End => return Err("type without end".to_string()),
                    _ => {}
                }
                self.at += 1;
            }
        }
        if self.sym("?") || self.sym("*") || self.sym("+") {
            self.at += 1;
        }
        Ok(())
    }
}
