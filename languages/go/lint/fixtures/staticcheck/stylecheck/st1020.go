package stylecheck

// Returns the total.
func Total(values []int) int { // want-above ST1020
	sum := 0
	for _, value := range values {
		sum += value
	}
	return sum
}

// Length returns how many values there are.
func Length(values []int) int {
	return len(values)
}
