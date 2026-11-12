package sa9

func Wrong(value any) int { // want any-in-exported-signature
	if value, ok := value.(int); ok { // want identical-branches
		return value
	} else { // want indent-error-flow
		return value // want SA9008
	}
}

func Asserted(value any) int { // want any-in-exported-signature
	if count, ok := value.(int); ok {
		return count
	}
	return 0
}
