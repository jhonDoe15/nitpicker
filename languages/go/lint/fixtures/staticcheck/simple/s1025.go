package simple

import "fmt"

type Label string

func (label Label) String() string {
	return string(label)
}

func Formatted(label Label) string {
	return fmt.Sprintf("%s", label) // want S1025
}

func Stringed(label Label) string {
	return label.String()
}
