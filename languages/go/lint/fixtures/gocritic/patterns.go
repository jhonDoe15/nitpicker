package gocritic

import (
	"path/filepath"
	"regexp"
)

var (
	symbols     = regexp.MustCompile(`[$-%]`)      // want badRegexp
	hosts       = regexp.MustCompile(`google.com`) // want regexpPattern
	digits      = regexp.MustCompile(`[0-9]+`)     // want regexpSimplify
	words       = regexp.MustCompile(`\w+`)
	escaped     = regexp.MustCompile(`google\.com`)
	compiled, _ = regexp.Compile(`^\d+$`) // want regexpMust
)

func Matches(text string) bool {
	return symbols.MatchString(text) || hosts.MatchString(text) || digits.MatchString(text) ||
		words.MatchString(text) || escaped.MatchString(text) || compiled.MatchString(text)
}

func Config(dir string) string {
	return filepath.Join(dir, "/config.yaml") // want filepathJoin
}

func ConfigFile(dir string) string {
	return filepath.Join(dir, "config.yaml")
}

var Limits = map[string]int{
	"small ": 1, // want mapKey
	"large":  2,
}
