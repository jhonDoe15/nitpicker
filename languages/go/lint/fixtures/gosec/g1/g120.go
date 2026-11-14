package g1

import (
	"mime/multipart"
	"net/http"
)

func Unbounded(writer http.ResponseWriter, request *http.Request) {
	if err := request.ParseMultipartForm(32 << 20); err != nil { // want G120
		http.Error(writer, err.Error(), http.StatusBadRequest)
	}
}

func Streamed(request *http.Request) (*multipart.Reader, error) {
	return request.MultipartReader()
}
