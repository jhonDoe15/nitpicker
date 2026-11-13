package gocritic

import (
	"fmt"
	// "os"
)

// Legacy prints a value.
//
// deprecated: use Print.
func Legacy(value int) {
	fmt.Println(value)
}

// Print prints a value.
//
// Deprecated: use fmt.Println.
func Print(value int) {
	fmt.Println(value)
}

// Stub ...
func Stub() {}

// Documented reports nothing.
func Documented() {}

func Cleanup(values []int) []int {
	// values = values[:0]
	return values
}

func Pending(values []int) []int {
	// TODO
	return values
}

func Planned(values []int) []int {
	// TODO(#12): drop the copy once callers stop mutating the result.
	return values
}

// want-at 5 commentedOutImport
// want-at 10 deprecatedComment
// want-at 23 docStub
// want-at 29 commentedOutCode
// want-at 34 todo-without-issue
