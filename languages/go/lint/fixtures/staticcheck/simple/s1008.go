package simple

func Positive(count int) bool {
	if count > 0 {
		return true
	}
	return false
}

func PositiveDirect(count int) bool {
	return count > 0
}

// want-at 4 S1008
