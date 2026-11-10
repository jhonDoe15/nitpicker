package g6

func Head() []byte {
	values := []byte{}
	return values[:3] // want G602
}

func Prefix(values []byte) []byte {
	return values[:min(3, len(values))]
}
