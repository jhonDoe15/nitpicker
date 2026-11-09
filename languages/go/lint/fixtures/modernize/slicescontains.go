package modernize

import "slices"

func Has(values []string, wanted string) bool {
	for _, value := range values { // want slicescontains
		if value == wanted {
			return true
		}
	}
	return false
}

func HasContains(values []string, wanted string) bool {
	return slices.Contains(values, wanted)
}
