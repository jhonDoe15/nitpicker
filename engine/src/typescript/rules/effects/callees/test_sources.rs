//! Which files of the program are test sources, as the project layout says. The JavaScript side writes a
//! file once per run: the working directory on the first line, then `1` or `0` and an absolute path for every
//! file of the listing. A file outside the listing is a test source when its path says so; otherwise its
//! layout is unknown and the caller leaves the file to the plugin rule, as it does every file when the listing
//! is missing.
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

static TEST_PATH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:^|/)(?:test|tests|__tests__|__mocks__|test-support|e2e|fixtures|__fixtures__)/|\.(?:test|spec)\.[^/]+$").unwrap());

#[derive(Default)]
pub struct TestSources {
    directory: String,
    verdicts: HashMap<String, bool>,
}

/// `path.relative` for absolute POSIX paths.
fn relative(from: &str, to: &str) -> String {
    let from: Vec<&str> = from.split('/').filter(|part| !part.is_empty()).collect();
    let to: Vec<&str> = to.split('/').filter(|part| !part.is_empty()).collect();
    let common = from.iter().zip(&to).take_while(|(left, right)| left == right).count();
    let up = std::iter::repeat_n("..", from.len() - common);
    up.chain(to[common..].iter().copied()).collect::<Vec<_>>().join("/")
}

impl TestSources {
    pub fn read(path: &str) -> Option<TestSources> {
        let text = std::fs::read_to_string(path).ok()?;
        let mut lines = text.lines();
        let directory = lines.next()?.trim_end_matches('/');
        let directory = if directory.is_empty() { "/" } else { directory }.to_string();
        let verdicts = lines.filter_map(|line| line.split_once('\t')).map(|(verdict, file)| (file.to_string(), verdict == "1")).collect();
        Some(TestSources { directory, verdicts })
    }

    /// `isTestSource`; `None` when the file is outside the listing and its path does not settle it.
    pub fn is_test(&self, file: &str) -> Option<bool> {
        if self.directory.is_empty() {
            return None;
        }
        if let Some(known) = self.verdicts.get(file) {
            return Some(*known);
        }
        TEST_PATH.is_match(&relative(&self.directory, file)).then_some(true)
    }
}

#[cfg(test)]
mod tests {
    use super::relative;

    #[test]
    fn relative_paths_climb_out_of_the_directory() {
        assert_eq!(relative("/a/b", "/a/b/c/d.ts"), "c/d.ts");
        assert_eq!(relative("/a/b", "/a/x/d.ts"), "../x/d.ts");
        assert_eq!(relative("/", "/a/d.ts"), "a/d.ts");
    }
}
