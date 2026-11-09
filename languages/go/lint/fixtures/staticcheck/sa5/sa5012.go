package sa5

import "strings"

func OddPairs(text string) string {
	return strings.NewReplacer("a", "b", "c").Replace(text) // want SA5012
}

func Pairs(text string) string {
	return strings.NewReplacer("a", "b", "c", "d").Replace(text)
}
