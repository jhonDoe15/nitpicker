package simple

type Reader interface {
	Read() string
}

func Same(reader Reader) bool {
	_, ok := reader.(Reader) // want S1040
	return ok
}

func Plain(reader Reader) Reader {
	return reader
}
