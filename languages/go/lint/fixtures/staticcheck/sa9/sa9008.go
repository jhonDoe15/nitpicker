package sa9

func Wrong(value any) int {
	if value, ok := value.(int); ok { // want identical-branches
		return value
	} else { // want indent-error-flow
		return value // want SA9008
	}
}

func Asserted(value any) int {
	if count, ok := value.(int); ok {
		return count
	}
	return 0
}
