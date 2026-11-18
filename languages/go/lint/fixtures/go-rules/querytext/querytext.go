package querytext

import (
	"context"
	"database/sql"
)

func Search(ctx context.Context, db *sql.DB, group string) error {
	where := "SELECT * FROM info WHERE tenant = ?"
	if group != "" {
		where += " AND group_id LIKE " // want malformed-query-text
	}
	_, err := db.ExecContext(ctx, where)
	return err
}

func Bound(ctx context.Context, db *sql.DB, group string) error {
	where := "SELECT * FROM info WHERE tenant = ?"
	if group != "" {
		where += " AND group_id LIKE ?"
	}
	_, err := db.ExecContext(ctx, where)
	return err
}

func Lock(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, "INSERT INTO lock_table (a, b, c) VALUES (?, ?)") // want malformed-query-text
	return err
}

func Matching(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, "INSERT INTO lock_table (a, b) VALUES (?, now())")
	return err
}

func Joined(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, "SELECT * FROM t ORDER"+"BY a") // want malformed-query-text
	return err
}

func Extended(ctx context.Context, db *sql.DB) error {
	query := "SELECT * FROM t WHERE a ="
	query += " ?"
	_, err := db.ExecContext(ctx, query)
	return err
}

func Prose() string {
	return "Select a value = anything"
}
