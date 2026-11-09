package unconvert

func Sum(values []int) int {
	total := 0
	for _, value := range values {
		total += int(value) // want unconvert
	}
	return total
}

func Widen(values []int32) int64 {
	var total int64
	for _, value := range values {
		total += int64(value)
	}
	return total
}
