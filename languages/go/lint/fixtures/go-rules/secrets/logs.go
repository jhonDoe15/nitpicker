package secrets

import (
	"fmt"
	"log"
	"log/slog"
	"os"
)

type Session struct {
	Token   string
	IsToken bool
}

func Connect(token string, session Session) error {
	log.Printf("connecting with %s", token)                   // want secret-in-log
	slog.Info("session", slog.String("token", session.Token)) // want secret-in-log
	slog.Info("session", slog.Bool("token_set", session.IsToken))
	fmt.Fprintln(os.Stderr, "token:", os.Getenv("API_TOKEN")) // want secret-in-log
	if session.Token == "" {
		return fmt.Errorf("no session for %s", []byte(token)) // want secret-in-log
	}
	slog.Info("connected", slog.Int("token_length", len(token)))
	return nil
}
