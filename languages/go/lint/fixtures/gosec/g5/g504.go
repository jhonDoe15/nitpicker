package g5

import (
	"net/http"
	"net/http/cgi" // want G504
)

func Gateway(path string) http.Handler {
	return &cgi.Handler{Path: path}
}
