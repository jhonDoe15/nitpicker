package g1

import (
	"net/http"
	"net/http/pprof"
)

func Internal() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	return mux
}
