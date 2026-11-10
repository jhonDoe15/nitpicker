package params

import (
	"context"
	"encoding/json"
	"strings"
)

func Flagged(text string, loud bool) string { // want flag-parameter
	if loud {
		return strings.ToUpper(text)
	}
	return text
}

func Loud(text string) string {
	return strings.ToUpper(text)
}

func Late(text string, ctx context.Context) error { // want context-as-argument
	_ = text
	return ctx.Err()
}

func Early(ctx context.Context, text string) (string, error) {
	return text, ctx.Err()
}

func Ignored(text string, count int) int { // want unused-parameter
	return count
}

func Blank(_ string, count int) int {
	return count
}

type Tile struct {
	size int
}

func (t Tile) Area() int {
	t.size *= 2 // want modifies-value-receiver
	area := t.size * t.size
	return area
}

type Box struct {
	size int
}

func (b *Box) Grown() {
	b.size++
}

func (b *Box) Name() string { // want unused-receiver
	return "box"
}

func (*Box) Label() string {
	return "box"
}

func (b *Box) MarshalJSON() ([]byte, error) { // want marshal-receiver
	return json.Marshal(b.size)
}

type Crate struct {
	size int
}

func (c Crate) MarshalJSON() ([]byte, error) {
	return json.Marshal(c.size)
}
