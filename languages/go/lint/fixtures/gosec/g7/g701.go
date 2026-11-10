package g7

import (
	"database/sql"
	"net/http"
)

func Injected(db *sql.DB, request *http.Request) (*sql.Rows, error) {
	query := "SELECT id FROM users WHERE name = '" + request.URL.Query().Get("name") + "'" // want G202
	rows, err := db.QueryContext(request.Context(), query)                                 // want G701
	return rows, err
}

func Parameterised(db *sql.DB, request *http.Request) (*sql.Rows, error) {
	rows, err := db.QueryContext(request.Context(), "SELECT id FROM users WHERE name = $1", request.URL.Query().Get("name"))
	return rows, err
}
