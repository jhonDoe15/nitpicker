export const LOOKUP = `package shop

import (
	"fmt"
	"os"
	"strings"
)

func HasDash(name string) bool {
	return strings.Index(name, "-") != -1
}

func Forget(name string) {
	os.Remove(name)
}

func Describe(value interface{}) string {
	return fmt.Sprint(value)
}

func Counts(names []string) map[string]int {
	//revive:disable-next-line:enforce-map-style
	counts := make(map[string]int)
	for _, name := range names {
		counts[name]++
	}
	return counts
}
`;

export const SKIP_S1003 = 'checks = ["all", "-S1003"]\n';

export const PROJECT_STATICCHECK = JSON.stringify({
  preset: 'go',
  tools: { staticcheck: { precedence: ['project'] } },
});

export const OWN_RULES = `package shop

import (
	"log"
	"os"
	"strconv"
)

func Quantity(text string) int {
	value, err := strconv.Atoi(text)
	if err != nil {
		panic(err)
	}
	return value
}

func Read(name string) ([]byte, error) {
	data, err := os.ReadFile(name)
	if err != nil {
		log.Printf("read %s: %v", name, err)
		return nil, err
	}
	return data, nil
}
`;

export const STOCK = `package shop

import (
	"context"
	"io"
	"os"

	"example.com/shop/shop/stock"
)

func AtEnd(err error) bool {
	return err == io.EOF
}

func Size(name string) (int64, error) {
	info, err := os.Stat(name)
	if err != nil {
		return 0, nil
	}
	return info.Size(), nil
}

func Sync(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return stock.Refresh()
}
`;

export const STOCK_REFRESH = `// Package stock refreshes the stock.
package stock

import "context"

func Refresh() error {
	return load(context.Background())
}

func load(ctx context.Context) error {
	return ctx.Err()
}
`;

export const STATUS = `package shop

type Status int

const (
	Open Status = iota
	Shipped
	Returned
)

func Label(status Status) string {
	switch status {
	case Open:
		return "open"
	case Shipped:
		return "shipped"
	}
	return ""
}
`;

const MODELS = `package shop

import "gorm.io/gorm"

type Customer struct {
	gorm.Model
	Orders []Order
}

type Order struct {
	gorm.Model
	CustomerID uint
}
`;

const GORM_STUB = `// Package gorm stands in for gorm.io/gorm.
package gorm

type Model struct {
	ID uint \`gorm:"primarykey"\`
}
`;

const ORDERS_MIGRATION = `CREATE TABLE orders (
  id bigserial PRIMARY KEY,
  customer_id bigint REFERENCES customers (id)
);
`;

export const GORM_MODELS = {
  'go.mod':
    'module example.com/shop\n\ngo 1.22\n\nrequire gorm.io/gorm v0.0.0\n\nreplace gorm.io/gorm => ./third_party/gorm\n',
  'third_party/gorm/go.mod': 'module gorm.io/gorm\n\ngo 1.22\n',
  'third_party/gorm/gorm.go': GORM_STUB,
  'shop/models.go': MODELS,
};

export const GORM_MIGRATED = {
  ...GORM_MODELS,
  'migrations/0001_orders.up.sql': ORDERS_MIGRATION,
};
