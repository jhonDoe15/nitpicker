// Package asynq stands in for github.com/hibiken/asynq in the fixtures.
package asynq

import "context"

type Task struct{}

func (*Task) Payload() []byte {
	return nil
}

type ServeMux struct{}

func (*ServeMux) HandleFunc(string, func(context.Context, *Task) error) {}
