package sa4

import "strings"

func Discarded(text string) string {
	strings.ToUpper(text) // want SA4017
	return text
}

func Kept(text string) string {
	return strings.ToUpper(text)
}
