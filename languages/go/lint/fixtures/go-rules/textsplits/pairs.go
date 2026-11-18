package textsplits

import "strings"

func Value(line string) string {
	return strings.Split(line, ":")[1] // want pair-split-drops-rest
}

func Setting(entry string) (key, value string) {
	parts := strings.Split(entry, "=") // want pair-split-drops-rest
	return parts[0], parts[1]
}

func Checked(entry string) (key, value string, ok bool) {
	parts := strings.Split(entry, "=")
	if len(parts) != 2 {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func Rest(entry string) (key, value string) {
	parts := strings.Split(entry, ":")
	return parts[0], strings.Join(parts[1:], ":")
}

func Limited(line string) string { return strings.SplitN(line, ":", 2)[1] }

func Cut(line string) string {
	_, value, _ := strings.Cut(line, ":")
	return value
}

func Clock(timeText string) string { return strings.Split(timeText, ":")[1] }

func Other(line string) string { return strings.Split(line, ",")[1] }

func FixedPair() string { return strings.Split("a:b", ":")[1] }

func Fields(line string) string {
	parts := strings.Split(line, ":")
	if len(parts) < 3 {
		return ""
	}
	return parts[1]
}
