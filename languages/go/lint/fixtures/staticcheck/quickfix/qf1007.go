package quickfix

func Flag(count int) bool {
	large := false // want QF1007
	if count > 10 {
		large = true
	}
	return large
}

func FlagDirect(count int) bool {
	large := count > 10
	return large
}
