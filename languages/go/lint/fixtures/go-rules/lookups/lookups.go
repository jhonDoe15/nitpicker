package lookups

import (
	"slices"
	"strings"
)

var allowed = map[string]bool{"GET": true, "POST": true}

func Allowed(method string) bool {
	return allowed[strings.ToLower(method)] // want case-mismatched-lookup
}

func Methods(method string) bool {
	names := []string{"Get", "Post"}
	return slices.Contains(names, strings.ToLower(method)) // want case-mismatched-lookup
}

func Disabled(name string, hints []string) bool {
	disabled := map[string]bool{}
	for _, hint := range hints {
		disabled[hint] = true
	}
	return disabled[strings.ToLower(name)] // want case-mismatched-lookup
}

func Duplicates(names []string) int {
	seen := map[string]bool{}
	count := 0
	for _, item := range names {
		if seen[item] { // want case-mismatched-lookup
			count++
		}
		seen[strings.ToLower(item)] = true
	}
	return count
}

func Normalized(name string, hints []string) bool {
	disabled := map[string]bool{}
	for _, hint := range hints {
		disabled[strings.ToLower(hint)] = true
	}
	return disabled[strings.ToLower(name)]
}

var lower = map[string]bool{"get": true, "post": true}

func Lower(method string) bool {
	return lower[strings.ToLower(method)]
}

func Written(names []string, name string) bool {
	found := map[string]bool{}
	for _, item := range names {
		found[strings.ToLower(item)] = true
	}
	return found[strings.ToLower(name)]
}
