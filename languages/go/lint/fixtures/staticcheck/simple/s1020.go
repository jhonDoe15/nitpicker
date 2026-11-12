package simple

type Sizer interface {
	Size() int
}

func IsSizerGuarded(value any) bool {
	if _, ok := value.(Sizer); ok && value != nil { // want S1020
		return true
	}
	return false
}

func IsSizer(value any) bool {
	_, ok := value.(Sizer)
	return ok
}
