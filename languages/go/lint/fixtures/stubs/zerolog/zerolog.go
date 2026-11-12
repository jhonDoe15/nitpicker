// Package zerolog stands in for github.com/rs/zerolog in the fixtures.
package zerolog

type Event struct{}

func (event *Event) Err(error) *Event {
	return event
}

func (*Event) Msg(string) {}

type Logger struct{}

func (*Logger) Error() *Event {
	return &Event{}
}
