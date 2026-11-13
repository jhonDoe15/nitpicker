package g1

import "net/http"

func Everything() http.Handler {
	return http.FileServer(http.Dir("/")) // want G111
}

func Assets() http.Handler {
	return http.FileServer(http.Dir("./static"))
}
