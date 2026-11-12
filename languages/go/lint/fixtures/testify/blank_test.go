package testify

import (
	"testing"

	_ "github.com/stretchr/testify/mock" // want blank-import
)

func TestNothing(t *testing.T) { // want test-without-assertion
	t.Log("shop")
}
