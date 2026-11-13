package g7

import "net/http"

func Next(writer http.ResponseWriter, request *http.Request) {
	http.Redirect(writer, request, request.URL.Query().Get("next"), http.StatusFound) // want G710
}

func Home(writer http.ResponseWriter, request *http.Request) {
	http.Redirect(writer, request, "/home", http.StatusFound)
}
