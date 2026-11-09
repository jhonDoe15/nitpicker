package sloglint

import (
	"context"
	"io"
	"log/slog"
)

func Started(ctx context.Context, logger *slog.Logger) {
	logger.Info("started") // want sloglint
	logger.InfoContext(ctx, "started")
}

func Stopped(logger *slog.Logger, name string) {
	logger.Info("stopped", slog.String("name", name))
}

func Paused(logger *slog.Logger, name string) {
	logger.Info("paused", "name", name) // want sloglint
}

func Quiet() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil)) // want sloglint
}

func Silent() *slog.Logger {
	return slog.New(slog.DiscardHandler)
}
