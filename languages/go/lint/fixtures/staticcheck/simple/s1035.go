package simple

import "net/http"

func SetCanonical(header http.Header) {
	header.Set(http.CanonicalHeaderKey("x-trace"), "1") // want S1035
}

func SetDirect(header http.Header) {
	header.Set("X-Trace", "1")
}
