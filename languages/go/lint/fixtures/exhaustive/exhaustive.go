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
		return "active"
	default:
		return ""
	}
}

func FullLabel(status Status) string {
	switch status {
	case Active:
		return "active"
	case Paused:
		return "paused"
	case Closed:
		return "closed"
	}
	return ""
}
