package branches

func Both(count int) int {
	if count > 0 { // want identical-branches
		return count
	} else { // want indent-error-flow
		return count
	}
}

func Chain(count int) int {
	if count > 10 { // want identical-ifelseif-branches
		return 1
	} else if count > 5 {
		return 1
	}
	return 0
}

func Cases(count int) int {
	switch count { // want identical-switch-branches
	case 10:
		return 1
	case 5:
		return 1
	}
	return 0
}

func SwitchConditions(count int) int {
	switch {
	case count > 10:
		return 2
	case count < 0:
		return 1
	case count > 10: // want identical-switch-conditions
		return 3
	}
	return 0
}

func Distinct(count int) int {
	switch {
	case count > 10:
		return 2
	case count < 0:
		return 1
	}
	return 0
}
