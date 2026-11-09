package modernize

func Empty() interface{} { // want any
	return 1
}

func Anything() any {
	return 1
}
