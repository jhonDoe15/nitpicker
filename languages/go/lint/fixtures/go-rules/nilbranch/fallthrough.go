package nilbranch

import (
	"fmt"
	"log"
	"strings"
)

type Writer struct {
	out     *strings.Builder
	formats map[string]string
	Name    *string
}

type Value interface {
	Render() string
}

type Item struct {
	Label string
}

func (w *Writer) Write(value *Item, format string) {
	if value == nil { // want nil-branch-fall-through
		w.out.WriteString("null")
	}
	if format == "" {
		format = w.formats[value.Label]
	}
	fmt.Fprintf(w.out, format, value.Label)
}

func Logged(item *Item) string {
	if item == nil { // want nil-branch-fall-through
		log.Println(missing)
	}
	return item.Label
}

func ReversedCheck(item *Item) string {
	if nil == item { // want nil-branch-fall-through
		log.Println(missing)
	}
	return item.Label
}

func Interface(value Value) string {
	if value == nil { // want nil-branch-fall-through
		log.Println(missing)
	}
	return value.Render()
}

func (w *Writer) Field() int {
	if w.Name == nil { // want nil-branch-fall-through
		log.Println(missing)
	}
	return len(*w.Name)
}

func Counted(item *Item, misses *int) string {
	if item == nil { // want nil-branch-fall-through
		*misses++
	}
	return item.Label
}

func Prepared(item *Item) string {
	if item == nil { // want nil-branch-fall-through
		load()
	}
	return item.Label
}
