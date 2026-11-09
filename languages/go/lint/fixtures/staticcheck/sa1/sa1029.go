package sa1

import "context"

func WithStringKey(ctx context.Context) context.Context {
	return context.WithValue(ctx, "user", 1) // want SA1029
}

type userKey struct{}

func WithTypedKey(ctx context.Context) context.Context {
	return context.WithValue(ctx, userKey{}, 1)
}
