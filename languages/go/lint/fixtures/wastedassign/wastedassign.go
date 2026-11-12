package wastedassign

func Pick(values []int, wanted int) int {
	found := -1 // want wastedassign
	for index, value := range values {
		if value == wanted {
			found = index // want wastedassign
			break
		}
	}
	found = len(values)
	return found
}

func First(values []int, wanted int) int {
	for index, value := range values {
		if value == wanted {
			return index
		}
	}
	return -1
}
