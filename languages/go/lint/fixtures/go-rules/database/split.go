package database

import (
	"context"
	"database/sql"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jmoiron/sqlx"
	"gorm.io/gorm"
)

const (
	insertOrder = "INSERT INTO orders (id) VALUES ($1)"
	markPaid    = "UPDATE orders SET state = 'paid' WHERE id = $1"
)

type Order struct{ ID int }

type OrderItem struct{ ID int }

type Shop struct {
	db   *gorm.DB
	pool *pgxpool.Pool
}

func Place(ctx context.Context, db *sql.DB, id int) error {
	if _, err := db.ExecContext(ctx, insertOrder, id); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, "INSERT INTO order_items (order_id) VALUES ($1)", id) // want writes-without-transaction
	return err
}

func PlaceNamed(ctx context.Context, db *sqlx.DB, order, item any) error {
	if _, err := db.NamedExecContext(ctx, "INSERT INTO orders (id) VALUES (:id)", order); err != nil {
		return err
	}
	_, err := db.NamedExecContext(ctx, "UPDATE stock SET count = :count", item) // want writes-without-transaction
	return err
}

func (s *Shop) Archive(order *Order, item *OrderItem) error {
	if err := s.db.Create(order).Error; err != nil {
		return err
	}
	return s.db.Delete(item).Error // want writes-without-transaction
}

func (s *Shop) Charge(ctx context.Context, id int) error {
	if _, err := s.pool.Exec(ctx, "UPDATE accounts SET balance = balance - 1 WHERE id = $1", id); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, "INSERT INTO ledger (account) VALUES ($1)", id) // want writes-without-transaction
	return err
}

func PlaceAtomically(ctx context.Context, db *sql.DB, id int) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, insertOrder, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO order_notes (order_id) VALUES ($1)", id); err != nil {
		return err
	}
	return tx.Commit()
}

func PlaceInside(ctx context.Context, tx *sql.Tx, id int) error {
	if _, err := tx.ExecContext(ctx, insertOrder, id); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, "INSERT INTO order_lines (order_id) VALUES ($1)", id)
	return err
}

func (s *Shop) ArchiveAtomically(order *Order, item *OrderItem) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(order).Error; err != nil {
			return err
		}
		return tx.Delete(item).Error
	})
}

func SameTable(ctx context.Context, db *sql.DB, id int) error {
	if _, err := db.ExecContext(ctx, markPaid, id); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, "UPDATE orders SET paid_at = now() WHERE id = $1", id)
	return err
}

func Either(ctx context.Context, db *sql.DB, state string, id int) error {
	if state == "paid" {
		_, err := db.ExecContext(ctx, markPaid, id)
		return err
	}
	_, err := db.ExecContext(ctx, "UPDATE invoices SET state = 'open' WHERE id = $1", id)
	return err
}

func Dynamic(ctx context.Context, db *sql.DB, query string, id int) error {
	if _, err := db.ExecContext(ctx, insertOrder, id); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, query, id)
	return err
}

func Passed(db *gorm.DB, order *Order, item *OrderItem) error {
	if err := db.Create(order).Error; err != nil {
		return err
	}
	return db.Delete(item).Error
}

func Qualified(ctx context.Context, db *sql.DB, id int) error {
	if _, err := db.ExecContext(ctx, "UPDATE public.accounts SET open = true WHERE id = $1", id); err != nil {
		return err
	}
	_, err := db.ExecContext(ctx, "UPDATE accounts SET seen = now() WHERE id = $1", id)
	return err
}
