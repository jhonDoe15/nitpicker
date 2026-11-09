package sa6

import "strings"

func SameLower(left, right string) bool {
	return strings.ToLower(left) == strings.ToLower(right) // want SA6005
}

func SameFold(left, right string) bool {
	return strings.EqualFold(left, right)
}
