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
