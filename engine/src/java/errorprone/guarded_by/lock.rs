//! Lock expressions (Error Prone's `GuardedByExpression`), the locks held at a point, and the message for an access.
use crate::java::types::index::TypeIndex;
use crate::java::types::model::Type;
use std::rc::Rc;

/// Where a local variable or parameter is declared; parameters of methods in other files by method and position.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum LocalKey {
    Declared(usize),
    Parameter(String, usize),
}

/// The symbol a select expression picks: a field, a method, or the outer instance of a class.
#[derive(Clone, PartialEq, Debug)]
pub enum Member {
    Field { owner: String, name: String, kind: Type, is_static: bool },
    Method { owner: String, name: String, parameters: Vec<Type>, returns: Type, is_static: bool },
    Outer { owner: String },
}

#[derive(Clone, PartialEq, Debug)]
pub enum Lock {
    This,
    Class(String),
    Type(String),
    Local { key: LocalKey, name: String, parameter: bool, kind: Option<Type> },
    Select(Rc<Lock>, Member),
    Error(String),
}

/// The name a class has in source: no package, no outer classes, and no number in front of a local class.
pub fn simple_name(class: &str) -> &str {
    let last = class.rsplit('.').next().unwrap_or(class);
    last.trim_start_matches(|c: char| c.is_ascii_digit())
}

/// The name javac prints for a class symbol.
pub fn class_display(class: &str) -> String {
    let last = class.rsplit('.').next().unwrap_or(class);
    if !last.is_empty() && last.chars().all(|c| c.is_ascii_digit()) {
        let flat = match class.rsplit_once('.') {
            Some((outer, number)) => format!("{outer}${number}"),
            None => class.to_string(),
        };
        return format!("<anonymous {flat}>");
    }
    if last.starts_with(|c: char| c.is_ascii_digit()) {
        return simple_name(class).to_string();
    }
    class.to_string()
}

impl Member {
    pub fn name(&self) -> &str {
        match self {
            Member::Field { name, .. } | Member::Method { name, .. } => name,
            Member::Outer { .. } => "outer$",
        }
    }
    pub fn owner(&self) -> &str {
        match self {
            Member::Field { owner, .. } | Member::Method { owner, .. } | Member::Outer { owner } => owner,
        }
    }
    pub fn is_static(&self) -> bool {
        matches!(self, Member::Field { is_static: true, .. } | Member::Method { is_static: true, .. })
    }
    pub fn is_outer(&self) -> bool {
        matches!(self, Member::Outer { .. })
    }
    /// The symbol as javac prints it: a method with its parameter types.
    pub fn symbol_text(&self) -> String {
        match self {
            Member::Method { name, parameters, .. } => {
                let types: Vec<String> = parameters.iter().map(Type::name).collect();
                format!("{name}({})", types.join(","))
            }
            other => other.name().to_string(),
        }
    }
}

impl Lock {
    pub fn select(base: &Lock, member: Member) -> Lock {
        Lock::Select(Rc::new(base.clone()), member)
    }

    /// The type of the lock, when it has one.
    pub fn kind(&self) -> Option<Type> {
        match self {
            Lock::Select(_, Member::Field { kind, .. }) => Some(kind.clone()),
            Lock::Select(_, Member::Method { returns, .. }) => Some(returns.clone()),
            Lock::Select(_, Member::Outer { owner }) => Some(Type::class(owner)),
            Lock::Class(owner) | Lock::Type(owner) => Some(Type::class(owner)),
            Lock::Local { kind, .. } => kind.clone(),
            Lock::This | Lock::Error(_) => None,
        }
    }

    /// The first expression of a chain of selects.
    pub fn root(&self) -> &Lock {
        let mut current = self;
        while let Lock::Select(base, _) = current {
            current = base;
        }
        current
    }

    /// The lock as Error Prone prints it in messages.
    pub fn show(&self) -> String {
        match self {
            Lock::This => "this".to_string(),
            Lock::Class(owner) => format!("{}.class", simple_name(owner)),
            Lock::Type(owner) => simple_name(owner).to_string(),
            Lock::Local { name, .. } => name.clone(),
            Lock::Error(text) => text.clone(),
            Lock::Select(base, member) => match member {
                Member::Outer { owner } => {
                    let mut current = base;
                    let mut through_this = matches!(**current, Lock::This);
                    while let (Lock::Select(next, _), false) = (&**current, through_this) {
                        current = next;
                        through_this = matches!(**current, Lock::This);
                    }
                    if through_this { format!("{}.this", simple_name(owner)) } else { format!("{}.this$0", base.show()) }
                }
                Member::Method { name, .. } => format!("{}.{name}()", base.show()),
                Member::Field { name, .. } => format!("{}.{name}", base.show()),
            },
        }
    }
}


const READ_WRITE_LOCK: &str = "java.util.concurrent.locks.ReadWriteLock";

/// The locks held at a point of a method body; they print in the order they were taken.
#[derive(Clone, Default)]
pub struct Held(Vec<Lock>);

impl Held {
    pub fn plus(&self, lock: Lock) -> Held {
        let mut next = self.clone();
        if !next.0.contains(&lock) {
            next.0.push(lock);
        }
        next
    }
    pub fn plus_all(&self, locks: Vec<Lock>) -> Held {
        locks.into_iter().fold(self.clone(), |held, lock| held.plus(lock))
    }
    pub fn contains(&self, lock: &Lock) -> bool {
        self.0.contains(lock)
    }
    pub fn len(&self) -> usize {
        self.0.len()
    }
    fn listed(&self) -> String {
        self.0.iter().map(Lock::show).collect::<Vec<_>>().join("', '")
    }
}

/// A guard that has to be reached the same way from every instance: `Type.class`, `Type.member`, `Outer.this`.
fn absolute(guard: &Lock) -> bool {
    !matches!(guard.root(), Lock::This)
}

fn rebase(lock: &Lock, access: &Lock) -> Option<Lock> {
    match lock {
        Lock::Select(base, member) => Some(Lock::select(&rebase(base, access)?, member.clone())),
        Lock::This => Some(access.clone()),
        _ => None,
    }
}

/// The lock to hold for an access: a guard relative to `this` is taken relative to the object accessed.
pub fn expected(guard: Lock, access: Option<Lock>) -> Option<Lock> {
    if absolute(&guard) {
        return Some(guard);
    }
    match access? {
        Lock::Select(base, _) => rebase(&guard, &base),
        _ => None,
    }
}

/// Whether the guard is a `ReadWriteLock`, which the check does not look into.
pub fn is_read_write(guard: &Lock, index: &TypeIndex) -> bool {
    match guard.kind() {
        Some(Type::Class(class, _)) => index.has(READ_WRITE_LOCK) && index.is_subtype(&class, READ_WRITE_LOCK),
        _ => false,
    }
}

fn outer_instance(guard: &Lock) -> Option<Rc<Lock>> {
    let mut current = guard;
    let mut found = None;
    while let Lock::Select(base, member) = current {
        if member.is_outer() {
            found = Some(current.clone());
            break;
        }
        current = base;
    }
    found.map(Rc::new)
}

fn through_this(guard: &Lock) -> bool {
    let mut current = guard;
    while let Lock::Select(base, _) = current {
        current = base;
        if matches!(current, Lock::This) {
            return true;
        }
    }
    false
}

/// The message for an access that needs `guard` while `held` is held.
pub fn message(guard: &Lock, held: &Held) -> String {
    let mut text = String::new();
    if let Some(enclosing) = outer_instance(guard).filter(|_| !through_this(guard)) {
        let Lock::Select(base, member) = &*enclosing else { return text };
        if guard == &*enclosing {
            text.push_str(&format!("Access should be guarded by enclosing instance '{}' of '{}', which is not accessible in this scope", class_display(member.owner()), base.show()));
        } else {
            let sym = match guard {
                Lock::Select(_, member) => member.symbol_text(),
                other => other.show(),
            };
            text.push_str(&format!("Access should be guarded by '{sym}' in enclosing instance '{}' of '{}', which is not accessible in this scope", class_display(member.owner()), base.show()));
        }
        if held.len() > 0 {
            text.push_str(&format!("; instead found: '{}'", held.listed()));
        }
        return text;
    }
    text.push_str(&format!("This access should be guarded by '{}'", guard.show()));
    if matches!(guard, Lock::Error(_)) {
        text.push_str(", which could not be resolved");
    } else if held.len() == 0 {
        text.push_str(", which is not currently held");
    } else {
        text.push_str(&format!("; instead found: '{}'", held.listed()));
    }
    text
}

