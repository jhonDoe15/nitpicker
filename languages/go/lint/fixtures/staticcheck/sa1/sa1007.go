package sa1

import "net/url"

func BrokenURL() (*url.URL, error) {
	return url.Parse(":") // want SA1007
}

func ValidURL() (*url.URL, error) {
	return url.Parse("https://example.com")
}
