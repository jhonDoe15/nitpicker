package g1

import "net/url"

func Joined(segment string) (string, error) {
	return url.JoinPath("https://example.com/api", segment) // want G125
}

func Escaped(segment string) (string, error) {
	return url.JoinPath("https://example.com/api", url.PathEscape(segment))
}
