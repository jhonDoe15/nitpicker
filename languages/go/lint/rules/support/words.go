package support

import (
	"regexp"
	"strings"
)

var (
	lowerToUpper = regexp.MustCompile(`([a-z0-9])([A-Z])`)
	acronymEnd   = regexp.MustCompile(`([A-Z]+)([A-Z][a-z])`)
	separators   = regexp.MustCompile(`[^A-Za-z0-9]+`)
)

func WordsOf(name string) []string {
	spaced := acronymEnd.ReplaceAllString(lowerToUpper.ReplaceAllString(name, "$1 $2"), "$1 $2")
	words := []string{}
	for _, word := range separators.Split(spaced, -1) {
		if word != "" {
			words = append(words, strings.ToLower(word))
		}
	}
	return words
}
