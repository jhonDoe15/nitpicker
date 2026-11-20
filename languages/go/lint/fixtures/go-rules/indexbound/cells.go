package indexbound

import "errors"

var errRange = errors.New("out of range")

func Cell(cells []string, column int) (string, error) {
	if column < 0 || column > len(cells) { // want index-bound-off-by-one
		return "", errRange
	}
	return cells[column], nil
}

func Allowed(table []bool, c int) bool {
	return c > len(table) || !table[c] // want index-bound-off-by-one
}

func Reversed(cells []string, column int) string {
	if len(cells) < column { // want index-bound-off-by-one
		return ""
	}
	return cells[column]
}

func Accepting(cells []string, column int) string {
	if column <= len(cells) && cells[column] != "" { // want index-bound-off-by-one
		return cells[column]
	}
	return ""
}

func Strict(cells []string, column int) (string, error) {
	if column < 0 || column >= len(cells) {
		return "", errRange
	}
	return cells[column], nil
}

func Insert(cells []string, column int, value string) ([]string, error) {
	if column > len(cells) {
		return nil, errRange
	}
	return append(cells[:column], append([]string{value}, cells[column:]...)...), nil
}

func Other(cells, other []string, column int) string {
	if column > len(cells) {
		return ""
	}
	return other[column]
}

func Quiet(cells []string, column int, note func(string)) string {
	if column > len(cells) {
		note("far")
	}
	return cells[column%2]
}

func Reassigned(cells []string, column int) string {
	if column > len(cells) {
		return ""
	}
	column = 0
	return cells[column]
}
