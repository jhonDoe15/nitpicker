//! Language-neutral core: a language plugs in a grammar, file rules and project passes.
pub mod finding;
pub mod runner;
pub mod source;

use finding::Finding;
use source::SourceFile;

/// A check that looks at one parsed file. Runs in parallel across files.
pub trait FileRule: Sync + Send {
    fn id(&self) -> &'static str;
    fn check(&self, file: &SourceFile, out: &mut Vec<Finding>);
    /// Rules that need whole-project knowledge (types, for instance) override this one.
    fn needs_project(&self) -> bool {
        false
    }
    fn check_in(&self, file: &SourceFile, _project: &Project, out: &mut Vec<Finding>) {
        self.check(file, out);
    }
    /// Called once after every file was checked, for findings that hang on what other files hold.
    fn finish(&self, _project: &Project, _out: &mut Vec<Finding>) {}
}

/// Whatever a language knows about the whole project; rules of that language downcast it.
pub type Project = dyn std::any::Any + Send + Sync;

#[derive(Default)]
pub struct Options {
    pub classpath: Vec<std::path::PathBuf>,
    /// The Java release the sources are compiled for (`--release`), when it is older than the JDK: the library of that release is used.
    pub release: Option<u32>,
    /// javac ran Lombok over the sources: source classes have the members Lombok writes, and `val` infers a local's type.
    pub lombok: bool,
}

/// Facts a language extracts from one file for whole-project passes (duplicates, metrics).
#[derive(Default)]
pub struct FileFacts {
    pub tokens: Vec<source::Token>,
    pub functions: Vec<FunctionMetric>,
}

#[derive(serde::Serialize, Clone)]
pub struct FunctionMetric {
    pub file: String,
    pub name: String,
    pub line: usize,
    pub lines: usize,
    pub cyclomatic: u32,
    pub parameters: u32,
    pub max_nesting: u32,
}

/// What a language provides to the engine. Adding Kotlin, Python or Go means one more impl.
pub trait Language: Sync + Send {
    fn id(&self) -> &'static str;
    fn extensions(&self) -> &'static [&'static str];
    fn grammar(&self) -> tree_sitter::Language;
    fn rules(&self) -> Vec<Box<dyn FileRule>>;
    fn facts(&self, file: &SourceFile) -> FileFacts;
    /// The text to hand to the grammar when it cannot take the file as written. Byte offsets must stay the same.
    fn grammar_text(&self, _text: &str) -> Option<String> {
        None
    }
    /// The file with everything blanked that the project pass does not read (method bodies, for instance),
    /// byte for byte as long as the file. `None` keeps the file as it is.
    fn outline(&self, _file: &SourceFile) -> Option<String> {
        None
    }
    fn project(&self, _files: &[SourceFile], _options: &Options, _needed: bool) -> Box<Project> {
        Box::new(())
    }
}
