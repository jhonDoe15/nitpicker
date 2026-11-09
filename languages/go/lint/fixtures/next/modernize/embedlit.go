package modernize

type Key struct {
	ID int
}

type Row struct {
	Key
	Name string
}

func Nested() Row {
	return Row{Key: Key{ID: 1}, Name: "a"} // want embedlit
}

func Flat() Row {
	return Row{ID: 1, Name: "a"}
}
