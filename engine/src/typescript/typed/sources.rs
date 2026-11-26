//! Which files of the program the typed checks look at, decided once for all of them.
use crate::typescript::EXTENSIONS;
use crate::typescript::types::session::Session;
use regex::Regex;

pub struct Sources {
    tests: Regex,
    /// Production files of the program: inside the source root, not declarations, not tests or fixtures.
    pub files: Vec<String>,
}

pub fn is_declaration_file(path: &str) -> bool {
    path.ends_with(".d.ts") || path.ends_with(".d.mts") || path.ends_with(".d.cts")
}

impl Sources {
    pub fn of(session: &Session) -> Sources {
        let tests = Regex::new(r"(?:^|/)(?:__tests__|tests|fixtures)/|\.(?:test|spec)\.[cm]?tsx?$").expect("pattern");
        let mut sources = Sources { tests, files: Vec::new() };
        sources.files = session.files.iter().filter(|path| sources.is_production(session, path)).cloned().collect();
        sources
    }

    pub fn is_production(&self, session: &Session, path: &str) -> bool {
        self.is_production_under(&session.root, path)
    }

    /// Whether a file is production code of the folder `root`: inside it, not a declaration, test or fixture.
    pub fn is_production_under(&self, root: &str, path: &str) -> bool {
        let relative = path.strip_prefix(root.trim_end_matches('/')).and_then(|rest| rest.strip_prefix('/'));
        !is_declaration_file(path) && relative.is_some_and(|relative| !self.tests.is_match(relative))
    }
}

/// The text of a file the engine can parse, or `None` for other files of the program (JSON modules).
pub fn text_of(path: &str) -> Option<String> {
    let known = path.rsplit('.').next().is_some_and(|extension| EXTENSIONS.contains(&extension));
    if known { std::fs::read_to_string(path).ok() } else { None }
}
