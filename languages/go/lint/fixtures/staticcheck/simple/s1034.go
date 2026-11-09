package simple

func Describe(value any) string {
	switch value.(type) { // want S1034
	case string:
		text, ok := value.(string)
		if ok {
			return text
		}
	}
	return ""
}

func DescribeBound(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	}
	return ""
}
