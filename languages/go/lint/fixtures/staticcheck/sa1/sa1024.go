package sa1

import "strings"

func TrimRepeated(text string) string {
	return strings.TrimLeft(text, "aab") // want SA1024
}

func TrimPrefixed(text string) string {
	return strings.TrimPrefix(text, "aab")
}
