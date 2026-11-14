// Package paging holds constants a test in another package copies.
package paging

const (
	PageSize = 25
	hidden   = 30
)

func Pages(items int) int {
	return (items + PageSize - 1) / PageSize * hidden / hidden
}
