package simple

func Declared(count int) int {
	var total int // want S1021
	total = count * 2
	return total
}

func Assigned(count int) int {
	total := count * 2
	return total
}
