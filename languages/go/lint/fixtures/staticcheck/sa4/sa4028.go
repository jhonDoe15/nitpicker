package sa4

func ModOne(count int) int {
	return count % 1 // want SA4028
}

func ModTwo(count int) int {
	return count % 2
}
