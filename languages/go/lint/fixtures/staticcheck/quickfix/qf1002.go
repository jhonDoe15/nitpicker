package quickfix

func Untagged(count int) string {
	switch { // want QF1002
	case count == 1:
		return "one"
	case count == 2:
		return "two"
	}
	return "many"
}

func Tagged(count int) string {
	switch count {
	case 1:
		return "one"
	case 2:
		return "two"
	}
	return "many"
}
