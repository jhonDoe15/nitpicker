package modernize

func Empty() interface{} { // want any any-in-exported-signature
	return 1
}

func Anything() any { // want any-in-exported-signature
	return 1
}
