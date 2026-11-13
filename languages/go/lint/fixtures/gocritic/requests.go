package gocritic

import (
	"context"
	"database/sql"
	"net/http"
)

func Fetch(ctx context.Context, url string) (*http.Request, error) {
	return http.NewRequestWithContext(ctx, http.MethodGet, url, nil) // want httpNoBody
}

func FetchEmpty(ctx context.Context, url string) (*http.Request, error) {
	return http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
}

func Handle(writer http.ResponseWriter, request *http.Request) {
	if request.URL.Path == "" {
		http.Error(writer, "missing path", http.StatusBadRequest) // want returnAfterHttpError
	}
	if request.Method == "" {
		http.Error(writer, "missing method", http.StatusBadRequest)
		return
	}
	writer.WriteHeader(http.StatusNoContent)
}

func Remove(ctx context.Context, db *sql.DB, id int) error {
	_, err := db.QueryContext(ctx, "DELETE FROM items WHERE id = ?", id) // want sqlQuery
	return err
}

func RemoveOnce(ctx context.Context, db *sql.DB, id int) error {
	_, err := db.ExecContext(ctx, "DELETE FROM items WHERE id = ?", id)
	return err
}
