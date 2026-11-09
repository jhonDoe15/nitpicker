package stylecheck

func Middle(count int) string {
	switch count {
	case 0:
		return "none"
	default: // want ST1015
		return "many"
	case 1:
		return "one"
	}
}

func Last(count int) string {
	switch count {
	case 0:
		return "none"
	case 1:
		return "one"
	default:
		return "many"
	}
}
