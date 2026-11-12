// Package zap stands in for go.uber.org/zap in the fixtures.
package zap

type Field struct {
	Key   string
	Value any
}

type Logger struct{}

func (*Logger) Error(string, ...Field) {}

func (*Logger) Fatal(string, ...Field) {}

func Error(err error) Field {
	return Field{Key: "error", Value: err}
}
