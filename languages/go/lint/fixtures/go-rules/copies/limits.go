package copies

type Status string

const (
	Limit           = 50
	Greeting        = "hello there"
	Ratio           = 2.5
	Active   Status = "active"
	tiny            = 2
	short           = "ok"
)

const (
	Low = iota + 100
	High
)

func Clamp(value int) int {
	return min(value, Limit)
}

func Describe(status Status) string {
	return Greeting + ", " + string(status) + " " + short
}

func Scale(value float64) float64 {
	return value * Ratio * tiny
}
