// Package zap stands in for go.uber.org/zap in the fixtures.
package zap

type Field struct {
	Key   string
	Value any
}

type Logger struct{}

func (logger *Logger) Error(message string, fields ...Field) {}

func (logger *Logger) Fatal(message string, fields ...Field) {}

func Error(err error) Field {
	return Field{Key: "error", Value: err}
}
