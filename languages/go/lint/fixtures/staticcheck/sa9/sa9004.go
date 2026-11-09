package sa9

type Level int

const (
	Low Level = 1 // want SA9004
	Mid       = 2
	Top       = 3
)

const (
	Small Level = iota
	Medium
	Large
)
