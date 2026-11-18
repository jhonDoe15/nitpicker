package translation

import (
	"regexp"
	"strings"
)

func Quoted(glob, path string) bool {
	pattern := strings.ReplaceAll(strings.ReplaceAll(regexp.QuoteMeta(glob), `\*\*`, ".*"), `\*`, "[^/]*")
	return regexp.MustCompile("^" + pattern + "$").MatchString(path)
}

func EscapedLike(glob string) string {
	escaped := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(glob)
	return strings.ReplaceAll(strings.ReplaceAll(escaped, "*", "%"), "?", "_")
}

func EscapeFirst(glob string) string {
	return strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(glob, "%", `\%`), "_", `\_`), "*", "%")
}

func Constant(path string) bool {
	pattern := strings.ReplaceAll(strings.ReplaceAll("src/**/*.go", "**", ".*"), "*", "[^/]*")
	return regexp.MustCompile(pattern).MatchString(path)
}

func NotARegexp(glob string) string {
	return strings.ReplaceAll(strings.ReplaceAll(glob, "**", ".*"), "*", "[^/]*")
}

func Single(glob string) *regexp.Regexp {
	return regexp.MustCompile(strings.ReplaceAll(glob, "*", ".*"))
}

func Unrelated(text string) *regexp.Regexp {
	return regexp.MustCompile(strings.ReplaceAll(strings.ReplaceAll(text, " ", "-"), "_", "-"))
}
