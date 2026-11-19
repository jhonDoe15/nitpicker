package copypasted

import "testing"

func TestSmall(t *testing.T) {
	if got := Total(10, "EUR"); got != 12 {
		t.Errorf("got %d", got)
	}
}

func TestMedium(t *testing.T) {
	if got := Total(20, "EUR"); got != 24 {
		t.Errorf("got %d", got)
	}
}

func TestLarge(t *testing.T) { // want copy-pasted-tests
	if got := Total(-30, "EUR"); got != -36 {
		t.Errorf("got %d", got)
	}
}

func TestHuge(t *testing.T) { // want copy-pasted-tests
	if got := Total(40, "EUR"); got != 48 {
		t.Errorf("got %d", got)
	}
}

func TestTable(t *testing.T) {
	cases := []struct {
		name  string
		price int
		want  int
	}{{"small", 10, 12}, {"medium", 20, 24}, {"large", 30, 36}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Total(tc.price, "EUR"); got != tc.want {
				t.Errorf("got %d", got)
			}
		})
	}
}

func TestNetSmall(t *testing.T) {
	if got := Net(10, "EUR"); got != 10 {
		t.Errorf("got %d", got)
	}
}

func TestNetLarge(t *testing.T) {
	if got := Net(30, "EUR"); got != 30 {
		t.Errorf("got %d", got)
	}
}

func TestCopiedSubtests(t *testing.T) {
	t.Run("a", func(t *testing.T) {
		if Net(1, "EUR") != 1 {
			t.Error("a")
		}
	})
	t.Run("b", func(t *testing.T) {
		if Net(2, "EUR") != 2 {
			t.Error("b")
		}
	})
	t.Run("c", func(t *testing.T) { // want copy-pasted-tests
		if Net(3, "EUR") != 3 {
			t.Error("c")
		}
	})
}
