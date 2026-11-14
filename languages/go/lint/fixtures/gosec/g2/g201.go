package g2

import (
	"context"
	"database/sql"
	"fmt"
)

func Formatted(ctx context.Context, db *sql.DB, name string) (*sql.Rows, error) {
	query := fmt.Sprintf("SELECT id FROM users WHERE name = '%s'", name) // want G201
	rows, err := db.QueryContext(ctx, query)
	return rows, err
}

func Bound(ctx context.Context, db *sql.DB, name string) (*sql.Rows, error) {
	rows, err := db.QueryContext(ctx, "SELECT id FROM users WHERE name = $1", name)
	return rows, err
}
