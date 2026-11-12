package rowserrcheck

import (
	"context"
	"database/sql"
	"errors"
)

func First(ctx context.Context, db *sql.DB) (name string, err error) {
	rows, err := db.QueryContext(ctx, "SELECT name FROM users") // want rowserrcheck
	if err != nil {
		return "", err
	}
	defer func() { err = errors.Join(err, rows.Close()) }()
	if rows.Next() {
		err = rows.Scan(&name)
	}
	return name, err
}

func CheckedFirst(ctx context.Context, db *sql.DB) (name string, err error) {
	rows, err := db.QueryContext(ctx, "SELECT name FROM users")
	if err != nil {
		return "", err
	}
	defer func() { err = errors.Join(err, rows.Close()) }()
	if rows.Next() {
		err = rows.Scan(&name)
	}
	return name, errors.Join(err, rows.Err())
}
