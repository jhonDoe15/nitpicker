package quickfix

func Chain(color string) int {
	if color == "red" { // want QF1003
		return 1
	} else if color == "green" {
		return 2
	}
	return 0
}

func Switched(color string) int {
	switch color {
	case "red":
		return 1
	case "green":
		return 2
	}
	return 0
}
