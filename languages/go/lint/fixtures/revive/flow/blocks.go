package flow

import (
	"os"
	"strings"
)

func Empty(values []string) int {
	count := len(values)
	switch count { // want empty-block
	}
	return count
}

func Parse(path string) (string, error) {
	if data, err := os.ReadFile( // want multiline-if-init
		path,
	); err == nil {
		return string(data), nil
	}
	return "", ErrEmpty
}

func Read(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func Literal(found bool) bool {
	return found && true // want bool-literal-in-expr
}

func Chained(builder *strings.Builder) func() {
	return builder.Reset
}

func Deferred(builder *strings.Builder) {
	defer Chained(builder)() // want defer
}

func Reset(builder *strings.Builder) {
	reset := Chained(builder)
	defer reset()
}
