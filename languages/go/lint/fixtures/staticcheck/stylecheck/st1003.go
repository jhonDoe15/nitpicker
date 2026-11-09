package stylecheck

func user_name() string { // want ST1003
	return "a"
}

func ParseUrl(text string) string { // want ST1003
	return text
}

func ParseURL(text string) string {
	return userName(text)
}

func userName(text string) string {
	return text + user_name()
}
