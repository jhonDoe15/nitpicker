package flow

func Single(count int) string {
	switch count { // want unnecessary-stmt
	case 0:
		return "none"
	}
	return "some"
}

func Condition(count int) string {
	if count == 0 {
		return "none"
	}
	return "some"
}

func Broken(count int) string {
	label := "some"
	switch count {
	case 0:
		label = "none"
	case 1:
		label = "one"
	}
	return label
}

func Received(values <-chan int) int {
	select {
	case value := <-values:
		return value
	default:
		break // want useless-break
	}
	return 0
}

func Fallen(count int) string {
	switch count {
	case 0:
		fallthrough // want useless-fallthrough
	case 1:
		return "few"
	default:
		return "many"
	}
}

func Joined(count int) string {
	switch count {
	case 0, 1:
		return "few"
	default:
		return "many"
	}
}

func DefaultFirst(count int) string {
	switch count {
	default: // want enforce-switch-style
		return "many"
	case 0:
		return "none"
	case 1:
		return "one"
	}
}

func DefaultLast(count int) string {
	switch count {
	case 0:
		return "none"
	case 1:
		return "one"
	default:
		return "many"
	}
}
