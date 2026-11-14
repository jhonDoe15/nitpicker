package jobs

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/RichardKnop/machinery/v2"
	"github.com/hibiken/asynq"
)

const purge = "DELETE FROM carts WHERE shop = $1"

type Cleaner struct {
	db *sql.DB
}

func (c *Cleaner) ProcessTask(ctx context.Context, task *asynq.Task) error {
	for _, shop := range []string{string(task.Payload())} {
		if _, err := c.db.ExecContext(ctx, purge, shop); err != nil {
			return err
		}
	}
	return nil
}

func Register(mux *asynq.ServeMux, db *sql.DB, shops map[int]string) {
	mux.HandleFunc("carts:purge", func(ctx context.Context, _ *asynq.Task) error {
		for _, shop := range shops { // want failing-item-stops-job
			if _, err := db.ExecContext(ctx, purge, shop); err != nil { // want io-in-loop
				return fmt.Errorf("purge %s: %w", shop, err)
			}
		}
		return nil
	})
}

func PurgeSafely(ctx context.Context, _ *asynq.Task, db *sql.DB, shops []string) error {
	var failed []string
	for _, shop := range shops {
		if _, err := db.ExecContext(ctx, purge, shop); err != nil { // want io-in-loop
			failed = append(failed, shop)
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("purge failed for %v", failed)
	}
	return nil
}

func Enqueue(_ context.Context, _ *asynq.Task, shops []string, push func(string) error) error {
	for _, shop := range shops {
		if err := push(shop); err != nil {
			return err
		}
	}
	return nil
}

func Archive(ctx context.Context, db *sql.DB, shops []string) error {
	for _, shop := range shops { // want failing-item-stops-job
		if _, err := db.ExecContext(ctx, purge, shop); err != nil { // want io-in-loop
			return err
		}
	}
	return nil
}

func Tasks(server *machinery.Server) error {
	return server.RegisterTasks(map[string]any{"carts.archive": Archive, "carts.purge": Retire, "carts.drain": Drain,
		"carts.nested": Nested, "carts.stop": Stop})
}

func Retire(ctx context.Context, db *sql.DB, shops []string) error {
	for _, shop := range shops { // want failing-item-stops-job
		_, err := db.ExecContext(ctx, purge, shop) // want io-in-loop
		if err != nil {
			panic(err) // want panic-for-failure
		}
	}
	return nil
}

func Drain(ctx context.Context, db *sql.DB, shops []string) error {
	for _, shop := range shops { // want failing-item-stops-job
		if _, err := db.ExecContext(ctx, purge, shop); err != nil { // want io-in-loop
			break
		}
	}
	return ctx.Err()
}

func Nested(ctx context.Context, db *sql.DB, shops [][]string) error {
	for _, group := range shops { // want failing-item-stops-job
		_, err := db.ExecContext(ctx, purge, group[0]) // want io-in-loop
		if err != nil {
			for _, shop := range group {
				if shop == "" {
					continue
				}
			}
			return err
		}
	}
	return nil
}

func Stop(ctx context.Context, db *sql.DB, shops []string, last string) error {
	for _, shop := range shops {
		_, err := db.ExecContext(ctx, purge, shop) // want io-in-loop
		switch last {
		case "":
			if err != nil {
				break
			}
			fmt.Println(shop)
		case "skip":
			fmt.Println(last)
		}
	}
	return nil
}
