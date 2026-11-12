package concurrency

import (
	"context"
	"time"
)

func Ping(check func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second) // want context-outside-entry
	defer cancel()
	return check(ctx)
}

func Later(check func(context.Context) error) error {
	return check(context.TODO()) // want context-outside-entry
}

func PingWithin(ctx context.Context, check func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	return check(ctx)
}
