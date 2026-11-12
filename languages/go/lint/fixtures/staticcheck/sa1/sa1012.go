package sa1

import "context"

func Ask(ctx context.Context) error {
	return ctx.Err()
}

func AskNil() error {
	return Ask(nil) // want SA1012
}

func AskWith(ctx context.Context) error {
	return Ask(ctx)
}
