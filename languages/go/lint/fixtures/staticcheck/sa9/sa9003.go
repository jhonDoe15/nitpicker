package sa9

func Empty(count int) int {
	if count > 0 { // want SA9003
	}
	return count
}

func Guarded(count int) int {
	if count > 0 {
		return count
	}
	return 0
}
