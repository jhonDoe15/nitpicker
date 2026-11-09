package sa3

import "testing"

func BenchmarkFixedCount(b *testing.B) {
	b.N = 1000 // want SA3001
	for range b.N {
		Answer()
	}
}

func BenchmarkLoop(b *testing.B) {
	for b.Loop() {
		Answer()
	}
}
