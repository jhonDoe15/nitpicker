package quickfix

func Until(values []int, limit int) int {
	index := 0
	for {
		if index >= limit { // want QF1006
			break
		}
		index += values[index]
	}
	return index
}

func While(values []int, limit int) int {
	index := 0
	for index < limit {
		index += values[index]
	}
	return index
}
