package sa1

import "time"

func BrokenLayout() (time.Time, error) {
	return time.Parse("2006-13-02", "2024-01-02") // want SA1002
}

func ValidLayout() (time.Time, error) {
	return time.Parse(time.DateOnly, "2024-01-02")
}
