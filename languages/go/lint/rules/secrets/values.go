package secrets

import (
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
)

var (
	secretName     = regexp.MustCompile(anyOf(secretNameWords) + "$")
	secretWord     = regexp.MustCompile(anyOf(uncoveredWords(secretNameWords)))
	passphraseName = regexp.MustCompile(anyOf(passphraseNameWords) + "$")
	placeholder    = regexp.MustCompile("(?i)^" + anyOf(placeholderPatterns) + "$")
	notSecret      = regexp.MustCompile("^" + anyOf(notSecretPatterns) + "$")
	identifier     = regexp.MustCompile("^" + anyOf(identifierPatterns) + "$")
	credentials    = compiled(credentialShapes, "")
	embedded       = compiled(embeddedSecretPatterns, "(?i)")
	urlScheme      = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*://`)
	whitespace     = regexp.MustCompile(`[\s\v\x{85}\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}` +
		`\x{202f}\x{205f}\x{3000}\x{feff}]`)
	digit          = regexp.MustCompile(`\d`)
	letter         = regexp.MustCompile(`[A-Za-z]`)
	camelStep      = regexp.MustCompile(`[a-z][A-Z]`)
	characterKinds = compiled([]string{`[a-z]`, `[A-Z]`, `\d`, `[^A-Za-z0-9]`}, "")
)

func anyOf(patterns []string) string {
	return "(?:" + strings.Join(patterns, "|") + ")"
}

func compiled(patterns []string, flags string) []*regexp.Regexp {
	expressions := []*regexp.Regexp{}
	for _, pattern := range patterns {
		expressions = append(expressions, regexp.MustCompile(flags+pattern))
	}
	return expressions
}

func uncoveredWords(words []string) []string {
	return slices.DeleteFunc(slices.Clone(words), func(word string) bool {
		return slices.ContainsFunc(words, func(other string) bool { return other != word && strings.Contains(word, other) })
	})
}

func nameWords(name string) []string {
	words := support.WordsOf(name)
	kept := len(words)
	for kept > 0 && slices.Contains(secretValueSuffixes, words[kept-1]) {
		kept--
	}
	return words[:min(len(words), max(1, kept))]
}

func joinedLetters(words []string) string {
	return digit.ReplaceAllString(strings.Join(words, ""), "")
}

func isSecretName(name string) bool {
	words := nameWords(name)
	count := len(words)
	marker := count > 1 && words[count-1] == "token" && slices.Contains(markerTokenWords, words[count-2])
	masked := slices.ContainsFunc(words, func(word string) bool { return slices.Contains(maskedNameWords, word) })
	return !(marker || masked) && secretName.MatchString(joinedLetters(words))
}

func isCandidate(text string) bool {
	return !whitespace.MatchString(text) && !placeholder.MatchString(text) && !notSecret.MatchString(text)
}

func looksLikeSecretValue(text string) bool {
	if utf8.RuneCountInString(text) < secretValueLength || !isCandidate(text) {
		return false
	}
	kinds := 0
	for _, kind := range characterKinds {
		if kind.MatchString(text) {
			kinds++
		}
	}
	return (digit.MatchString(text) && letter.MatchString(text)) || kinds >= secretCharacterClasses
}

func hasCredentialShape(text string) bool {
	for _, shape := range credentials {
		if shape.MatchString(text) {
			return true
		}
	}
	for _, shape := range embedded {
		if match := shape.FindStringSubmatch(text); match != nil && looksLikeSecretValue(match[1]) {
			return true
		}
	}
	return false
}

func isPassphrase(text, name string) bool {
	long := utf8.RuneCountInString(text) >= passphraseLength && camelStep.MatchString(text)
	return long && isCandidate(text) && passphraseName.MatchString(joinedLetters(nameWords(name)))
}

func namesASecret(text, name string) bool {
	words := support.WordsOf(text)
	named := identifier.MatchString(text) && secretWord.MatchString(joinedLetters(words))
	return named || strings.Join(words, "") == strings.Join(support.WordsOf(name), "")
}

func isHardcodedSecret(text, name string) bool {
	if hasCredentialShape(text) || urlScheme.MatchString(text) || namesASecret(text, name) {
		return false
	}
	return looksLikeSecretValue(text) || isPassphrase(text, name)
}
