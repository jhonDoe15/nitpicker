package quickfix

func Neither(left, right bool) bool {
	return !(left || right) // want QF1001
}

func NeitherApplied(left, right bool) bool {
	return !left && !right
}
