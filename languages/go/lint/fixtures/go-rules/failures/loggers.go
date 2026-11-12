package failures

import (
	"fmt"
	"os"

	"github.com/rs/zerolog"
	"go.uber.org/zap"
)

func Open(logger *zap.Logger, name string) (*os.File, error) {
	file, err := os.Open(name)
	if err != nil {
		logger.Error("open failed", zap.Error(err)) // want logged-and-returned
		return nil, err
	}
	return file, nil
}

func Create(logger *zerolog.Logger, name string) (*os.File, error) {
	file, err := os.Create(name)
	if err != nil {
		logger.Error().Err(err).Msg("create failed") // want logged-and-returned
		return nil, fmt.Errorf("create %s: %w", name, err)
	}
	return file, nil
}

func OpenOrExit(logger *zap.Logger, name string) *os.File {
	file, err := os.Open(name)
	if err != nil {
		logger.Fatal("open failed", zap.Error(err))
	}
	return file
}
