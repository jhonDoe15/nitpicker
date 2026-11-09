package sa1

import "strings"

func ReplaceNone(text string) string {
	return strings.Replace(text, "a", "b", 0) // want SA1018
}

func ReplaceOne(text string) string {
	return strings.Replace(text, "a", "b", 1)
}
