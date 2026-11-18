// Package sqlx stands in for github.com/jmoiron/sqlx in the fixtures.
package sqlx

import (
	"context"
	"database/sql"
)

type DB struct {
	*sql.DB
}

type Tx struct {
	*sql.Tx
}

func (*DB) NamedExecContext(ctx context.Context, _ string, _ any) (sql.Result, error) {
	return nil, ctx.Err()
}

func (*Tx) NamedExecContext(ctx context.Context, _ string, _ any) (sql.Result, error) {
	return nil, ctx.Err()
}

func (*DB) BeginTxx(ctx context.Context, _ *sql.TxOptions) (*Tx, error) {
	return nil, ctx.Err()
}
