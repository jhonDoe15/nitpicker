package thelper

import "testing"

func checkName(t *testing.T, name string) { // want thelper
	if name == "" {
		t.Fatal("empty name")
	}
}

func checkCount(t *testing.T, count int) {
	t.Helper()
	if count < 0 {
		t.Fatal("negative count")
	}
}

func TestName(t *testing.T) {
	checkName(t, "shop")
	checkCount(t, 1)
}
