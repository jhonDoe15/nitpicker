package spancheck

import (
	"context"

	"go.opentelemetry.io/otel/trace"
)

func Load(ctx context.Context, tracer trace.Tracer) error {
	_, span := tracer.Start(ctx, "load") // want spancheck
	if ctx.Err() != nil {
		return ctx.Err() // want spancheck
	}
	span.End()
	return nil
}

func Save(ctx context.Context, tracer trace.Tracer) error {
	_, span := tracer.Start(ctx, "save")
	defer span.End()
	return ctx.Err()
}
