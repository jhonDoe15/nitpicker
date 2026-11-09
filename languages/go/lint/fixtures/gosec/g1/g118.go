package g1

import (
	"context"
	"time"
)

func Leaked(ctx context.Context) context.Context {
	child, _ := context.WithTimeout(ctx, time.Second) // want G118
	return child
}

func Cancelled(ctx context.Context, work func(context.Context) error) error {
	child, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	return work(child)
}
