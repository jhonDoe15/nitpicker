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
		logger.Error("read failed", slog.String("name", name), slog.Any("error", err)) // want logged-and-returned
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
		slog.Warn("using the default", slog.String("name", name), slog.Any("error", err))
		return []byte("{}")
	}
	return data
}

func Remove(name string) error {
	err := os.Remove(name)
	switch {
	case errors.Is(err, os.ErrNotExist):
		slog.Info("already removed", slog.Any("error", err))
		return nil
	case err != nil:
		slog.Error("remove failed", slog.Any("error", err)) // want logged-and-returned
		return err
	}
	return nil
}

func LoadAgain(name string) ([]byte, error) {
	data, err := os.ReadFile(name)
	if err != nil {
		slog.Warn("first read failed, retrying", slog.Any("error", err))
		data, err = os.ReadFile(name)
	}
	return data, err
}

type Attempt struct {
	err error
}

func Compare(first, second Attempt) error {
	slog.Info("first attempt", slog.Any("error", first.err))
	return second.err
}
