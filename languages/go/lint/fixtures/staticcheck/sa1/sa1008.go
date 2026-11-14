package sa1

import "net/http"

func RawHeader(header http.Header) []string {
	return header["content-type"] // want SA1008
}

func CanonicalHeader(header http.Header) string {
	return header.Get("Content-Type")
}
