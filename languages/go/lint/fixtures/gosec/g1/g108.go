package g1

import (
	"net/http"
	_ "net/http/pprof" // want G108
)

func Mux() *http.ServeMux {
	return http.NewServeMux()
}
