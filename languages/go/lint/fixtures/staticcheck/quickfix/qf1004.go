package quickfix

import "strings"

func ReplaceEvery(text string) string {
	return strings.Replace(text, "a", "b", -1) // want QF1004
}

func ReplaceAll(text string) string {
	return strings.ReplaceAll(text, "a", "b")
}
