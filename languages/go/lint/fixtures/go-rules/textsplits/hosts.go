package textsplits

import (
	"net"
	"net/http"
	"strings"
)

func Name(r *http.Request) string {
	return strings.Split(r.Host, ":")[0] // want host-port-colon-split
}

func Forwarded(r *http.Request) string {
	host, _, _ := strings.Cut(r.Header.Get("X-Forwarded-Host"), ":") // want host-port-colon-split
	return host
}

func Bare(forwardedHost string) string {
	colon := strings.Index(forwardedHost, ":") // want host-port-colon-split stringscut
	if colon < 0 {
		return forwardedHost
	}
	return forwardedHost[:colon]
}

func Parsed(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.Host)
	if err != nil {
		return strings.Split(r.Host, ":")[0]
	}
	return host
}

func Brackets(host string) string {
	if strings.HasPrefix(host, "[") {
		return host
	}
	return strings.Split(host, ":")[0]
}

func Mac(address string) []string { return strings.Split(address, ":") }

func Ghost(ghost string) []string { return strings.Split(ghost, ":") }
