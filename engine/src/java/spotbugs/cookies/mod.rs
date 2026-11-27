//! FindSecBugs' cookie detectors: CookieFlagsDetector (`flags`) and UrlRewritingDetector (`rewriting`);
//! PersistentCookieDetector's COOKIE_PERSISTENT judges a value SpotBugs knows and runs with the crypto calls
//! (`tls::values`). CookieReadDetector's COOKIE_USAGE is excluded by nitpicker's SpotBugs configuration.
mod flags;
mod rewriting;

use super::Context;
use super::idioms::compiled;
use tree_sitter::Node;

pub use flags::COOKIES;
pub const PATTERNS: &[&str] = &[flags::HTTP_ONLY, flags::SECURE, rewriting::REWRITING];

pub fn cookies<'a>(context: &Context<'a>, declared: &[Node<'a>]) {
    if !context.wants(PATTERNS) || !["Cookie", "encodeRedirect", "encodeU"].iter().any(|mark| context.file.text.contains(mark)) {
        return;
    }
    for class in declared.iter().copied() {
        let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { continue };
        let methods = compiled(context, &own, class);
        flags::check(context, &own, class, &methods);
        rewriting::check(context, &own, &methods);
    }
}
