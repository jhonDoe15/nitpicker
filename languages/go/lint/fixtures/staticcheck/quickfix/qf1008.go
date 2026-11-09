package quickfix

type Base struct {
	ID int
}

type Item struct {
	Base
	Name string
}

func Selected(item Item) int {
	return item.Base.ID // want QF1008
}

func Promoted(item Item) int {
	return item.ID
}
