package g2

import (
	"context"
	"database/sql"
)

func Concatenated(ctx context.Context, db *sql.DB, name string) (*sql.Rows, error) {
	rows, err := db.QueryContext(ctx, "SELECT id FROM users WHERE name = '"+name+"'") // want G202
	return rows, err
}

func Placeholder(ctx context.Context, db *sql.DB, name string) (*sql.Rows, error) {
	rows, err := db.QueryContext(ctx, "SELECT id FROM users WHERE name = ?", name)
	return rows, err
}
