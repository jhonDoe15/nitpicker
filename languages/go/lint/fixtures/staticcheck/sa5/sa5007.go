package sa5

func Recurse(count int) int {
	return Recurse(count) // want SA5007
}

func Countdown(count int) int {
	if count == 0 {
		return 0
	}
	return Countdown(count - 1)
}
