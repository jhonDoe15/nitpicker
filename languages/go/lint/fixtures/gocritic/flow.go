package gocritic

func Doubled(total int) int {
	total = total * 2 // want assignOp
	total *= 2
	return total
}

func Scaled(Factor int) int { // want captLocal
	result := Factor * 2
	return result + 1
}

func Deferred(release func(int), work func()) {
	defer func() { release(0) }() // want deferUnlambda
	work()
}

func DeferredOnce(release func(int), work func()) {
	defer release(0)
	work()
}

func Grade(score int) string {
	if score > 90 {
		return "A"
	} else { // want elseif
		if score > 80 {
			return "B"
		}
	}
	return "C"
}

func GradeOnce(score int) string {
	if score > 90 {
		return "A"
	} else if score > 80 {
		return "B"
	}
	return "C"
}

func Kind(score int) string {
	if score > 90 { // want ifElseChain
		return "high"
	} else if score > 50 {
		return "middle"
	} else {
		return "low"
	}
}

func KindOnce(score int) string {
	switch {
	case score > 90:
		return "high"
	case score > 50:
		return "middle"
	default:
		return "low"
	}
}

func Started(start func(), ready bool) bool {
	if start(); ready { // want initClause
		return true
	}
	return false
}

func Positive(score int) bool {
	switch { // want singleCaseSwitch
	case score > 0:
		return true
	}
	return false
}

func PositiveOnce(score int) bool {
	return score > 0
}

func Level(score int) string {
	switch true { // want switchTrue
	case score > 90:
		return "high"
	default:
		return "low"
	}
}

func Find(rows [][]int, target int) bool {
outer:
	for _, row := range rows {
		for _, value := range row {
			if value == target {
				break outer
			}
		}
	}
	return false
}

func Skipped(values []int) int {
	total := 0
loop: // want unlabelStmt
	for _, value := range values {
		if value < 0 {
			continue loop
		}
		total += value
	}
	return total
}

func Matched(rows [][]int, target int) int {
	found := 0
outer:
	for _, row := range rows {
		for _, value := range row {
			if value == target {
				found++
				continue outer // want unlabelStmt
			}
		}
	}
	return found
}

func Untagged(score int) string {
	switch {
	case score > 90:
		fallthrough // want emptyFallthrough
	case score > 80:
		return "high"
	}
	return "low"
}

func UntaggedOnce(score int) string {
	switch {
	case score > 90, score > 80:
		return "high"
	}
	return "low"
}

func Scoped(values []int) int {
	{ // want unnecessaryBlock
		values = values[1:]
	}
	return len(values)
}

func Closed(done func()) int {
	defer done() // want unnecessaryDefer
	return 0
}

func Swapped(left, right *int) {
	temporary := *left // want valSwap
	*left = *right
	*right = temporary
}

func SwappedOnce(left, right *int) {
	*left, *right = *right, *left
}
