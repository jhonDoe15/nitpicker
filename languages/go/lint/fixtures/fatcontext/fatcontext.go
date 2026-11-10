package fatcontext

import "context"

type key string

func Tagged(ctx context.Context, keys []string, run func(context.Context) error) error {
	for _, name := range keys {
		ctx = context.WithValue(ctx, key(name), true) // want fatcontext
		if err := run(ctx); err != nil {
			return err
		}
	}
	return nil
}

func TaggedEach(ctx context.Context, keys []string, run func(context.Context) error) error {
	for _, name := range keys {
		tagged := context.WithValue(ctx, key(name), true)
		if err := run(tagged); err != nil {
			return err
		}
	}
	return nil
}
