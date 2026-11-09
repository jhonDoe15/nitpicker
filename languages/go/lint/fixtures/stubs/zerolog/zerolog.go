// Package zerolog stands in for github.com/rs/zerolog in the fixtures.
package zerolog

type Event struct{}

func (event *Event) Err(err error) *Event {
	return event
}

func (event *Event) Msg(message string) {}

type Logger struct{}

func (logger *Logger) Error() *Event {
	return &Event{}
}
