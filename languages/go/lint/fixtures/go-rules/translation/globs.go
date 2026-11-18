package translation

import (
	"fmt"
	"regexp"
	"strings"
)

func Allowed(glob, path string) bool {
	pattern := strings.ReplaceAll(strings.ReplaceAll(glob, "**", ".*"), "*", "[^/]*") // want pattern-translation
	return regexp.MustCompile("^" + pattern + "$").MatchString(path)
}

func Direct(glob string) *regexp.Regexp {
	wild := strings.ReplaceAll(strings.ReplaceAll(glob, "*", ".+"), "?", ".") // want pattern-translation
	return regexp.MustCompile(fmt.Sprintf("^%s$", wild))
}

func Replacer(glob string) (*regexp.Regexp, error) {
	return regexp.Compile(strings.NewReplacer("**", ".*", "*", "[^/]*").Replace(glob)) // want pattern-translation
}

func Like(glob string) string {
	return strings.ReplaceAll(strings.ReplaceAll(glob, "*", "%"), "?", "_") // want pattern-translation
}

func LikeReplacer(glob string) string {
	return strings.NewReplacer("*", "%", "?", "_").Replace(glob) // want pattern-translation
}
