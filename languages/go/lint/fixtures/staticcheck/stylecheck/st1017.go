package stylecheck

func Yoda(count int) bool {
	return 0 == count // want ST1017
}

func Plain(count int) bool {
	return count == 0
}
