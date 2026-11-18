// Package pgx stands in for github.com/jackc/pgx/v5 in the fixtures.
package pgx

import "context"

type CommandTag struct{}

type Conn struct{}

func (*Conn) Exec(ctx context.Context, _ string, _ ...any) (CommandTag, error) {
	return CommandTag{}, ctx.Err()
}

type Tx interface {
	Exec(ctx context.Context, sql string, arguments ...any) (CommandTag, error)
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}

func (*Conn) Begin(ctx context.Context) (Tx, error) {
	return nil, ctx.Err()
}
