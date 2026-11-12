package unused

func helper() int { // want U1000
	return 1
}

func used() int {
	return 2
}

func Public() int {
	return used()
}

func usedInTests() int {
	return 3
}
