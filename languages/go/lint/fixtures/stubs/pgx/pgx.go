// Package pgx stands in for github.com/jackc/pgx/v5 in the fixtures.
package pgx

import "context"

type CommandTag struct{}

type Conn struct{}

func (conn *Conn) Exec(ctx context.Context, sql string, arguments ...any) (CommandTag, error) {
	return CommandTag{}, ctx.Err()
}
