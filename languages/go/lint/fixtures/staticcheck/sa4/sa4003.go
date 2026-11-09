package sa4

func Negative(count uint) bool {
	return count < 0 // want SA4003
}

func Zero(count uint) bool {
	return count == 0
}
