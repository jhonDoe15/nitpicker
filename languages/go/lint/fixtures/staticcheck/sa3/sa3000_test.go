package sa3

import "testing"

func TestMain(m *testing.M) {
	m.Run()
}

func TestAnswer(t *testing.T) {
	if Answer() != 42 {
		t.Fatal("wrong answer")
	}
}
