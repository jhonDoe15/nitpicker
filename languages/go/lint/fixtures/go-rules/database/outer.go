package database

import (
	"context"
	"database/sql"

	"github.com/jackc/pgx/v5/pgxpool"
	"gorm.io/gorm"
)

const (
	credit = "UPDATE accounts SET balance = balance + 1 WHERE id = $1"
	debit  = "UPDATE accounts SET balance = balance - 1 WHERE id = $1"
	refund = "UPDATE orders SET state = 'refunded' WHERE id = $1"
)

func Refund(ctx context.Context, db *sql.DB, id int) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, credit, id); err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, refund, id); err != nil { // want write-outside-transaction
		return err
	}
	return tx.Commit()
}

func Apply(ctx context.Context, db *sql.DB, tx *sql.Tx, id int) error {
	if _, err := tx.ExecContext(ctx, credit, id); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, "INSERT INTO ledger (account) VALUES ($1)", id) // want write-outside-transaction
	return err
}

func (s *Shop) Restock(order *Order, item *OrderItem) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(order).Error; err != nil {
			return err
		}
		return s.db.Create(item).Error // want write-outside-transaction
	})
}

func Settle(ctx context.Context, db *sql.DB, id int) error {
	if _, err := db.ExecContext(ctx, "INSERT INTO audit (order_id) VALUES ($1)", id); err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE orders SET state = 'settled' WHERE id = $1", id); err != nil {
		return err
	}
	return tx.Commit()
}

func Notify(ctx context.Context, db *sql.DB, id int) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE orders SET state = 'shipped' WHERE id = $1", id); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, "INSERT INTO notices (order_id) VALUES ($1)", id)
	return err
}

func (s *Shop) Within(order *Order, item *OrderItem) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		scoped := tx.Where("shop = ?", 1)
		if err := scoped.Create(order).Error; err != nil {
			return err
		}
		return tx.Create(item).Error
	})
}

func Move(ctx context.Context, pool *pgxpool.Pool, id int) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, debit, id); err != nil {
		return err
	}
	_, err = pool.Exec(ctx, "INSERT INTO ledger (account) VALUES ($1)", id) // want write-outside-transaction
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func inTransaction(ctx context.Context, db *sql.DB, work func(tx *sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := work(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func Audit(ctx context.Context, db *sql.DB, id int) error {
	err := inTransaction(ctx, db, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, credit, id)
		return err
	})
	if err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, "INSERT INTO audit (account) VALUES ($1)", id)
	return err
}

func Abandon(ctx context.Context, db *sql.DB, id int) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := tx.Rollback(); err != nil {
		return err
	}
	_, err = db.ExecContext(ctx, "INSERT INTO attempts (account) VALUES ($1)", id)
	return err
}
