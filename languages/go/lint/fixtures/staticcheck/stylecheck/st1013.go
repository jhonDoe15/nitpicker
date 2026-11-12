package stylecheck

import "net/http"

func Missing(writer http.ResponseWriter) {
	http.Error(writer, "missing", 404) // want ST1013
}

func NotFoundStatus(writer http.ResponseWriter) {
	http.Error(writer, "missing", http.StatusNotFound)
}
