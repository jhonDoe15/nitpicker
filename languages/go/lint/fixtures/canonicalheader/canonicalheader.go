package canonicalheader

import "net/http"

func ContentType(header http.Header) string {
	return header.Get("content-type") // want canonicalheader
}

func Accept(header http.Header) string {
	return header.Get("Accept")
}
