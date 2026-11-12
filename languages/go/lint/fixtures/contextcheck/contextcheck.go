package contextcheck

import "context"

func Handle(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return refresh() // want contextcheck
}

func HandleIgnored(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	return refreshIgnored() // want contextcheck
}

func HandleWithContext(ctx context.Context) error {
	return refreshWithContext(ctx)
}

func refresh() error {
	return refreshWithContext(context.Background()) // want context-outside-entry
}

// nolint:contextcheck
func refreshIgnored() error {
	return refreshWithContext(context.Background()) // want context-outside-entry
}

func refreshWithContext(ctx context.Context) error {
	return ctx.Err()
}
