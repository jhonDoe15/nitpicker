package simple

import "strings"

func HasIndex(text string) bool {
	return strings.Index(text, "a") != -1 // want S1003
}

func HasContains(text string) bool {
	return strings.Contains(text, "a")
}
