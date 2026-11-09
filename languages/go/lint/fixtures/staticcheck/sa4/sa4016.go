package sa4

func XorZero(flags int) int {
	return flags ^ 0 // want SA4016
}

func XorMask(flags int) int {
	return flags ^ 0x0f
}
