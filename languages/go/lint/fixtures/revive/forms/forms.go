package forms

import (
	"fmt"
	"strings"
)

func Counts(words []string) map[string]int {
	counts := make(map[string]int) // want enforce-map-style
	for _, word := range words {
		counts[word]++
	}
	return counts
}

func Literal(words []string) map[string]int {
	counts := map[string]int{}
	for _, word := range words {
		counts[word] += 1 // want increment-decrement
	}
	return counts
}

func Sized(words []string) map[string]int {
	counts := make(map[string]int, len(words))
	for _, word := range words {
		counts[word]++
	}
	return counts
}

func Empty() []string {
	return make([]string, 0) // want enforce-slice-style
}

func None() []string {
	return []string{}
}

func Join(first string, second string) string { // want enforce-repeated-arg-type-style
	return first + second
}

func Joined(first, second string) string {
	return first + second
}

func Shout(builder *strings.Builder) {
	fmt.Fprintf(builder, "hello") // want unnecessary-format
}

func Spoken(builder *strings.Builder) {
	builder.WriteString("hello")
}

func Debug(text string) {
	println(text) // want use-fmt-print
}

func Printed(text string) {
	fmt.Println(text)
}

func Spaced() int {
	//no space // want comment-spacings
	return 1
}
