package testify

import (
	"testing"

	_ "github.com/stretchr/testify/mock" // want blank-import
)

func TestNothing(t *testing.T) {
	t.Log("shop")
}
