package sa4

func Repeated(count int) string {
	if count > 1 {
		return "many"
	} else if count > 1 { // want SA4014
		return "again"
	}
	return "few"
}

func Distinct(count int) string {
	if count > 1 {
		return "many"
	} else if count == 1 {
		return "one"
	}
	return "none"
}
