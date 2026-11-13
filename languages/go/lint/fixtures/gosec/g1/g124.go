package g1

import "net/http"

func Plain(writer http.ResponseWriter) {
	http.SetCookie(writer, &http.Cookie{Name: "session", Value: "token"}) // want G124
}

func Hardened(writer http.ResponseWriter) {
	http.SetCookie(writer, &http.Cookie{
		Name: "session", Value: "token", Secure: true, HttpOnly: true, SameSite: http.SameSiteStrictMode,
	})
}
