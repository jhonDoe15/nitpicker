package passes

import (
	"context"
	"database/sql"
	"errors"
)

func Names(ctx context.Context, db *sql.DB) ([]string, error) {
	rows, err := db.QueryContext(ctx, "SELECT name FROM users") // want sqlrowserr
	if err != nil {
		return nil, err
	}
	defer func() { err = errors.Join(err, rows.Close()) }()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, nil
}

func CheckedNames(ctx context.Context, db *sql.DB) ([]string, error) {
	rows, err := db.QueryContext(ctx, "SELECT name FROM users")
	if err != nil {
		return nil, err
	}
	defer func() { err = closeRows(rows, err) }()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

func closeRows(rows *sql.Rows, err error) error {
	if closeErr := rows.Close(); closeErr != nil && err == nil {
		return closeErr
	}
	return err
}
