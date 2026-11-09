package quickfix

func Redundant() int {
	var count int = 5 // want QF1011
	return count
}

func Inferred() int {
	count := 5
	return count
}
