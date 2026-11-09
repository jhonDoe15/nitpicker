package failures

import (
	"errors"
	"fmt"
	"log"
	"log/slog"
	"os"
)

func Load(name string) ([]byte, error) {
	data, err := os.ReadFile(name)
	if err != nil {
		log.Printf("read %s: %v", name, err) // want logged-and-returned
		return nil, err
	}
	return data, nil
}

func LoadWrapped(logger *slog.Logger, name string) ([]byte, error) {
	data, err := os.ReadFile(name)
	if err != nil {
		logger.Error("read failed", "name", name, "error", err) // want logged-and-returned
		return nil, fmt.Errorf("read %s: %w", name, err)
	}
	return data, nil
}

func LoadOnce(name string) ([]byte, error) {
	data, err := os.ReadFile(name)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", name, err)
	}
	return data, nil
}

func LoadOrDefault(name string) []byte {
	data, err := os.ReadFile(name)
	if err != nil {
		slog.Warn("using the default", "name", name, "error", err)
		return []byte("{}")
	}
	return data
}

func Remove(name string) error {
	err := os.Remove(name)
	switch {
	case errors.Is(err, os.ErrNotExist):
		slog.Info("already removed", "error", err)
		return nil
	case err != nil:
		slog.Error("remove failed", "error", err) // want logged-and-returned
		return err
	}
	return nil
}
