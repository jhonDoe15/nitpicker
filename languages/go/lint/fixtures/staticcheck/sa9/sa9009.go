package sa9

// Directive returns one.
// go:noinline // want SA9009
func Directive() int {
	return 1
}

// Inline returns one.
//go:noinline
func Inline() int {
	return 1
}
