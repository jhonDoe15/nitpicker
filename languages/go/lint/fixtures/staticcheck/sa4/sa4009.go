package sa4

func Ignored(limit int) int { // want SA4009
	limit = 10
	return limit
}

func Used(limit int) int {
	return min(limit, 10)
}
