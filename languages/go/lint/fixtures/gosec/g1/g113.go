package g1

import "net/http"

func Conflicting(writer http.ResponseWriter) {
	writer.Header().Set("Transfer-Encoding", "chunked")
	writer.Header().Set("Content-Length", "100") // want G113
}

func Sized(writer http.ResponseWriter) {
	writer.Header().Set("Content-Length", "100")
}
