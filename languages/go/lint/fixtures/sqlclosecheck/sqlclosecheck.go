package sqlclosecheck

import (
	"context"
	"database/sql"
	"errors"
)

func Count(ctx context.Context, db *sql.DB) (int, error) {
	rows, err := db.QueryContext(ctx, "SELECT id FROM users") // want sqlclosecheck
	if err != nil {
		return 0, err
	}
	count := 0
	for rows.Next() {
		count++
	}
	return count, rows.Err()
}

func ClosedCount(ctx context.Context, db *sql.DB) (count int, err error) {
	rows, err := db.QueryContext(ctx, "SELECT id FROM users")
	if err != nil {
		return 0, err
	}
	defer func() { err = errors.Join(err, rows.Close()) }()
	for rows.Next() {
		count++
	}
	return count, rows.Err()
}
