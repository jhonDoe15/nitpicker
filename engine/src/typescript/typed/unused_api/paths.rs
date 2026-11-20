//! The two path operations of Node the check relies on: `path.posix.join` and `path.posix.matchesGlob`.

/// `path.posix.join(directory, specifier)`.
pub fn join(directory: &str, specifier: &str) -> String {
    let joined = match (directory.is_empty(), specifier.is_empty()) {
        (true, true) => return ".".to_string(),
        (true, false) => specifier.to_string(),
        (false, true) => directory.to_string(),
        (false, false) => format!("{directory}/{specifier}"),
    };
    normalize(&joined)
}

fn normalize(path: &str) -> String {
    let absolute = path.starts_with('/');
    let trailing = path.ends_with('/');
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.last().is_some_and(|last| *last != "..") {
                    parts.pop();
                } else if !absolute {
                    parts.push("..");
                }
            }
            other => parts.push(other),
        }
    }
    let mut out = parts.join("/");
    if out.is_empty() && !absolute {
        out.push('.');
    }
    if trailing && !out.is_empty() && out != "." {
        out.push('/');
    } else if trailing && out == "." {
        out.push('/');
    }
    if absolute { format!("/{out}") } else { out }
}

pub fn dirname(path: &str) -> &str {
    match path.rfind('/') {
        Some(0) => "/",
        Some(at) => &path[..at],
        None => ".",
    }
}

/// A glob the engine can match exactly like Node: literal text, `*`, `?` and `**` as a whole segment that is
/// not the last. Anything else (braces, classes, extended patterns, escapes, negation, a trailing `**` or
/// slash) is not ported.
pub fn glob_is_supported(pattern: &str) -> bool {
    let last = pattern.rsplit('/').next().unwrap_or_default();
    !pattern.contains(['{', '}', '[', ']', '(', ')', '!', '+', '@', '\\', '#'])
        && pattern.split('/').all(|segment| segment == "**" || !segment.contains("**"))
        && last != "**"
        && !last.is_empty()
}

/// Matches a path against a supported glob. A `*` or `?` does not match a leading dot of a segment, and `**`
/// does not cross segments that start with a dot, as in Node.
pub fn glob_matches(pattern: &str, path: &str) -> bool {
    let pattern: Vec<&str> = pattern.split('/').collect();
    let path: Vec<&str> = path.split('/').collect();
    segments_match(&pattern, &path)
}

fn segments_match(pattern: &[&str], path: &[&str]) -> bool {
    match pattern.split_first() {
        None => path.is_empty(),
        Some((&"**", rest)) => {
            if segments_match(rest, path) {
                return true;
            }
            match path.split_first() {
                Some((first, later)) if !first.starts_with('.') => segments_match(pattern, later),
                _ => false,
            }
        }
        Some((segment, rest)) => match path.split_first() {
            Some((first, later)) => segment_matches(segment, first) && segments_match(rest, later),
            None => false,
        },
    }
}

fn segment_matches(pattern: &str, text: &str) -> bool {
    let magic = pattern.contains(['*', '?']);
    if magic && text.starts_with('.') && !pattern.starts_with('.') {
        return false;
    }
    if magic && text.is_empty() {
        return false;
    }
    let pattern: Vec<char> = pattern.chars().collect();
    let text: Vec<char> = text.chars().collect();
    wildcard(&pattern, &text)
}

fn wildcard(pattern: &[char], text: &[char]) -> bool {
    match pattern.split_first() {
        None => text.is_empty(),
        Some(('*', rest)) => (0..=text.len()).any(|skip| wildcard(rest, &text[skip..])),
        Some(('?', rest)) => !text.is_empty() && wildcard(rest, &text[1..]),
        Some((literal, rest)) => text.first() == Some(literal) && wildcard(rest, &text[1..]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn joins_like_node() {
        assert_eq!(join("/a/b", "./c"), "/a/b/c");
        assert_eq!(join("/a/b", "../c/"), "/a/c/");
        assert_eq!(join("/a/b", "./"), "/a/b/");
        assert_eq!(join("/a/b", "."), "/a/b");
        assert_eq!(join("/a", "../../x"), "/x");
        assert_eq!(dirname("/a/b/c.ts"), "/a/b");
    }

    #[test]
    fn matches_simple_globs_like_node() {
        assert!(glob_matches("/a/pages/*.tsx", "/a/pages/home.tsx"));
        assert!(!glob_matches("/a/pages/*.tsx", "/a/pages/deep/home.tsx"));
        assert!(glob_matches("/a/pages/**/*.tsx", "/a/pages/deep/er/home.tsx"));
        assert!(glob_matches("/a/pages/**/*.tsx", "/a/pages/home.tsx"));
        assert!(!glob_matches("/a/pages/*.tsx", "/a/pages/.hidden.tsx"));
        assert!(!glob_matches("/a/**/*.tsx", "/a/.cache/home.tsx"));
        assert!(glob_matches("/a/page?.ts", "/a/page1.ts"));
        assert!(glob_is_supported("/a/**/*.tsx"));
        assert!(!glob_is_supported("/a/{b,c}/*.tsx"));
        assert!(!glob_is_supported("/a/b**/*.tsx"));
        assert!(!glob_is_supported("/a/**"));
        assert!(!glob_is_supported("/a/*/"));
        assert!(!glob_matches("/a/*", "/a/"));
        assert!(!glob_matches("/a/*.ts", "/a/.ts"));
    }
}
