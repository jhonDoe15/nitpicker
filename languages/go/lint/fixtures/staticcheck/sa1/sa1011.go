package sa1

import "strings"

func TrimInvalid(text string) string {
	return strings.Trim(text, "\xff") // want SA1011
}

func TrimValid(text string) string {
	return strings.Trim(text, " ")
}
