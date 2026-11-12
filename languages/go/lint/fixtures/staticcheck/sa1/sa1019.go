package sa1

import "strings"

func TitleDeprecated(text string) string {
	return strings.Title(text) // want SA1019
}

func UpperCurrent(text string) string {
	return strings.ToUpper(text)
}
