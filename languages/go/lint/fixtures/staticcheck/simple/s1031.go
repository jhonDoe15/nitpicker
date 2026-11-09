package simple

func SumGuarded(values []int) int {
	total := 0
	if values != nil { // want S1031
		for _, value := range values {
			total += value
		}
	}
	return total
}

func Sum(values []int) int {
	total := 0
	for _, value := range values {
		total += value
	}
	return total
}
