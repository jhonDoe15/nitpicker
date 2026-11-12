export const LOOKUP = `package shop

import (
	"os"
	"strings"
)

func HasDash(name string) bool {
	return strings.Index(name, "-") != -1
}

func Forget(name string) {
	os.Remove(name)
}

func Anything() interface{} {
	return 1
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

export const LOOKUP_TEST = `package shop

import "testing"

func TestCounts(t *testing.T) {
	if Counts([]string{"a"})["a"] != 1 {
		t.Fatal("a counted once")
	}
}
`;

export const SKIP_S1003 = 'checks = ["all", "-S1003"]\n';

export const PROJECT_STATICCHECK = JSON.stringify({
  preset: 'go',
  tools: { staticcheck: { precedence: ['project'] } },
});

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

export const STOCK_TEST = `package shop

import (
	"context"
	"testing"
)

func TestSize(t *testing.T) {
	if size, err := Size("missing.txt"); size != 0 || err != nil {
		t.Fatalf("missing file: %d, %v", size, err)
	}
	if size, err := Size("stock.go"); size == 0 || err != nil {
		t.Fatalf("stock.go: %d, %v", size, err)
	}
}

func TestSync(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	if err := Sync(ctx); err != nil {
		t.Fatal(err)
	}
	cancel()
	if Sync(ctx) == nil {
		t.Fatal("a cancelled context syncs")
	}
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

export const STATUS_TEST = `package shop

import "testing"

func TestStatusLabel(t *testing.T) {
	labels := []string{Label(Open), Label(Shipped), Label(Returned)}
	if labels[0] != "open" || labels[1] != "shipped" || labels[2] != "" {
		t.Fatalf("labels %q", labels)
	}
}
`;
