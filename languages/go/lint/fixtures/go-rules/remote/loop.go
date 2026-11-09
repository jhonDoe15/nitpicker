package remote

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"
)

var schema = []string{"CREATE TABLE orders (id int)", "CREATE INDEX orders_id ON orders (id)"}

func Rename(ctx context.Context, db *sql.DB, names map[int]string) error {
	for id, name := range names {
		_, err := db.ExecContext(ctx, "UPDATE users SET name = $1 WHERE id = $2", name, id) // want io-in-loop
		if err != nil {
			return fmt.Errorf("rename %d: %w", id, err)
		}
	}
	return nil
}

func Archive(ctx context.Context, conn *pgx.Conn, ids []int) error {
	for _, id := range ids {
		if _, err := conn.Exec(ctx, "DELETE FROM orders WHERE id = $1", id); err != nil { // want io-in-loop
			return fmt.Errorf("archive %d: %w", id, err)
		}
	}
	return nil
}

func ArchiveAll(ctx context.Context, conn *pgx.Conn, ids []int) error {
	if _, err := conn.Exec(ctx, "DELETE FROM orders WHERE id = ANY($1)", ids); err != nil {
		return fmt.Errorf("archive: %w", err)
	}
	return nil
}

func Migrate(ctx context.Context, db *sql.DB) error {
	for _, statement := range schema {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	return nil
}

func Ping(ctx context.Context, client *http.Client, requests []*http.Request) error {
	group, ctx := errgroup.WithContext(ctx)
	for _, request := range requests {
		group.Go(func() error {
			response, err := client.Do(request.WithContext(ctx))
			if err != nil {
				return fmt.Errorf("ping: %w", err)
			}
			return response.Body.Close()
		})
	}
	return group.Wait()
}

func Retry(ctx context.Context, db *sql.DB, attempts int) error {
	var err error
	for range attempts {
		if err = db.PingContext(ctx); err == nil {
			return nil
		}
	}
	return err
}
