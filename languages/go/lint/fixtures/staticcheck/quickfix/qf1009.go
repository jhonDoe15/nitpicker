package quickfix

import "time"

func SameOperator(left, right time.Time) bool {
	return left == right // want QF1009
}

func SameInstant(left, right time.Time) bool {
	return left.Equal(right)
}
