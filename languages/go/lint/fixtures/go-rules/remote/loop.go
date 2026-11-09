package remote

import (
	"context"
	"database/sql"
	"errors"
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

func FirstReachable(ctx context.Context, client *http.Client, mirrors []string) (*http.Response, error) {
	var lastErr error
	for _, mirror := range mirrors {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, mirror, nil)
		if err != nil {
			return nil, fmt.Errorf("request %s: %w", mirror, err)
		}
		response, err := client.Do(request)
		if err == nil {
			return response, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func Touch(ctx context.Context, db *sql.DB, ids []int) error {
	for index := 0; index < len(ids); index++ { // want rangeint
		if _, err := db.ExecContext(ctx, "UPDATE orders SET seen = true WHERE id = $1", ids[index]); err != nil { // want io-in-loop
			return fmt.Errorf("touch %d: %w", ids[index], err)
		}
	}
	return nil
}

func TouchEach(ctx context.Context, db *sql.DB, ids []int) error {
	for index := range len(ids) {
		_, err := db.ExecContext(ctx, "UPDATE orders SET seen = true WHERE id = $1", ids[index]) // want io-in-loop
		if err != nil {
			return fmt.Errorf("touch %d: %w", ids[index], err)
		}
	}
	return nil
}

func Insert(ctx context.Context, tx *sql.Tx, names []string) error {
	statement, err := tx.PrepareContext(ctx, "INSERT INTO users (name) VALUES ($1)")
	if err != nil {
		return fmt.Errorf("prepare: %w", err)
	}
	for _, name := range names {
		if _, err := statement.ExecContext(ctx, name); err != nil {
			return errors.Join(fmt.Errorf("insert %s: %w", name, err), statement.Close())
		}
	}
	return statement.Close()
}

func InsertEach(ctx context.Context, tx *sql.Tx, names []string) error {
	for _, name := range names {
		err := func() error {
			_, err := tx.ExecContext(ctx, "INSERT INTO users (name) VALUES ($1)", name) // want io-in-loop
			return err
		}()
		if err != nil {
			return fmt.Errorf("insert %s: %w", name, err)
		}
	}
	return nil
}

func MigrateLater(ctx context.Context, db *sql.DB) error {
	steps := [2]string{"ALTER TABLE orders ADD seen bool", "UPDATE orders SET seen = false"}
	for _, step := range steps {
		if _, err := db.ExecContext(ctx, step); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	for _, statement := range schema[1:] {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	return nil
}
