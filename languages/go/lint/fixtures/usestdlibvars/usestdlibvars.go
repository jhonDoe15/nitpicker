package usestdlibvars

import (
	"net/http"
	"time"
)

func Created(writer http.ResponseWriter) {
	writer.WriteHeader(201) // want usestdlibvars
}

func Accepted(writer http.ResponseWriter) {
	writer.WriteHeader(http.StatusAccepted)
}

func NewYear(year int) time.Time {
	return time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC) // want usestdlibvars
}

func NewYearsEve(year int) time.Time {
	return time.Date(year, time.December, 31, 0, 0, 0, 0, time.UTC)
}
