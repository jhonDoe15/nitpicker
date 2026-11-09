package sa4

func FirstPositive(values []int) int {
	found := 0
	for _, value := range values {
		if value > 0 {
			found = value
		}
		break // want SA4004
	}
	return found
}

func FirstMatch(values []int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}
