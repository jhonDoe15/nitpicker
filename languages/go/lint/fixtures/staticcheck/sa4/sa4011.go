package sa4

func BreakSwitch(values []int) int {
	found := 0
	for _, value := range values {
		switch {
		case value > 10:
			found = value
			break // want SA4011
		case value < 0:
			found = -value
		}
	}
	return found
}

func BreakLoop(values []int) int {
	found := 0
loop:
	for _, value := range values {
		switch {
		case value > 10:
			found = value
			break loop
		case value < 0:
			found = -value
		}
	}
	return found
}
