// Package pgxpool stands in for github.com/jackc/pgx/v5/pgxpool in the fixtures.
package pgxpool

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type Pool struct{}

func (*Pool) Exec(ctx context.Context, _ string, _ ...any) (pgx.CommandTag, error) {
	return pgx.CommandTag{}, ctx.Err()
}

func (*Pool) Begin(ctx context.Context) (pgx.Tx, error) {
	return nil, ctx.Err()
}
