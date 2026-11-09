package modernize

func Repeat(times int, run func()) {
	for index := 0; index < times; index++ { // want rangeint
		run()
	}
}

func RepeatRange(times int, run func()) {
	for range times {
		run()
	}
}
