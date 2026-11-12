package tparallel

import "testing"

func TestSerialTop(t *testing.T) { // want tparallel
	for _, name := range []string{"a", "b"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if name == "" {
				t.Fatal("empty")
			}
		})
	}
}

func TestParallelTop(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"a", "b"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if name == "" {
				t.Fatal("empty")
			}
		})
	}
}
