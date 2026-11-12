// Package pgx stands in for github.com/jackc/pgx/v5 in the fixtures.
package pgx

import "context"

type CommandTag struct{}

type Conn struct{}

func (*Conn) Exec(ctx context.Context, _ string, _ ...any) (CommandTag, error) {
	return CommandTag{}, ctx.Err()
}
