package modernize

func Pointer(value int) *int { // want newexpr
	return &value
}

func PointerNew(value int) *int {
	return new(value)
}
