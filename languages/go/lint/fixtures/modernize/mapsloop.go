package modernize

import "maps"

func Merge(target, source map[string]int) {
	for key, value := range source {
		target[key] = value // want mapsloop
	}
}

func MergeCopy(target, source map[string]int) {
	maps.Copy(target, source)
}
