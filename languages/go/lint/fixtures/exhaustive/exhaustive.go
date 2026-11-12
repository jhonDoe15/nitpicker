package exhaustive

type Status int

const (
	Active Status = iota
	Paused
	Closed
)

func Label(status Status) string {
	switch status { // want exhaustive
	case Active:
		return "active"
	case Paused:
		return "paused"
	}
	return ""
}

func IgnoredLabel(status Status) string {
	//exhaustive:ignore
	switch status { // want exhaustive
	case Active:
		return "active"
	case Paused:
		return "paused"
	}
	return ""
}

func ActiveLabel(status Status) string {
	switch status {
	case Active:
		return "active" // want repeated-string-literal
	default:
		return ""
	}
}

func FullLabel(status Status) string {
	switch status {
	case Active:
		return "active" // want repeated-string-literal
	case Paused:
		return "paused" // want repeated-string-literal
	case Closed:
		return "closed"
	}
	return ""
}
