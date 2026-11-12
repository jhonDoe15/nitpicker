package passes

import "net/http"

func Routes(mux *http.ServeMux, handler http.Handler) {
	mux.Handle("GET /items/{id}", handler) // want httpmux
	mux.Handle("/items/", handler)
}
