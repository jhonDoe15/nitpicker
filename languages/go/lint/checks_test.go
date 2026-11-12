package main

import "testing"

func TestSelectsChecksAsStaticcheckDoes(t *testing.T) {
	cases := []struct {
		selection []string
		rule      string
		want      bool
	}{
		{[]string{"all"}, "SA1000", true},
		{[]string{"all", "-ST1000"}, "ST1000", false},
		{[]string{"all", "-ST1000"}, "ST1003", true},
		{[]string{"-all", "S*"}, "S1000", true},
		{[]string{"-all", "S*"}, "SA1000", false},
		{[]string{"all", "-ST1*"}, "ST1003", false},
		{[]string{"all", "-st1*"}, "ST1003", true},
		{[]string{"ALL"}, "SA1000", false},
		{[]string{"*", "-SA*", "SA4006"}, "SA4006", true},
		{[]string{}, "SA1000", false},
	}
	for _, test := range cases {
		if got := selects(test.selection, test.rule); got != test.want {
			t.Errorf("selects(%v, %s) = %v, want %v", test.selection, test.rule, got, test.want)
		}
	}
}
