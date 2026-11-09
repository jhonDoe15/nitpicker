package sa1

import "regexp"

var Words = regexp.MustCompile(`\w+`)

func FindNone(text string) []string {
	return Words.FindAllString(text, 0) // want SA1010
}

func FindAll(text string) []string {
	return Words.FindAllString(text, -1)
}
