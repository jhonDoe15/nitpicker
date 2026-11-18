package nanguard

import (
	"errors"
	"math"
	"strconv"
)

func Parse(text string) (float64, error) {
	value, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(value) { // want nan-only-guard
		return 0, errors.New("not a number")
	}
	return value, nil
}

func Ratio(total, count float64) float64 {
	ratio := total / count
	if math.IsNaN(ratio) { // want nan-only-guard
		return 0
	}
	return ratio
}

func Area(width, height float64) float64 {
	area := width * height
	if math.IsNaN(area) { // want nan-only-guard
		return 0
	}
	return area
}

func ParseFinite(text string) (float64, error) {
	value, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0, errors.New("not a finite number")
	}
	return value, nil
}

func ParseBounded(text string) (float64, error) {
	value, err := strconv.ParseFloat(text, 64)
	if err != nil {
		return 0, err
	}
	if math.IsNaN(value) || value < 0 || value > 100 {
		return 0, errors.New("out of range")
	}
	return value, nil
}

func Half(total float64) float64 {
	half := total / 2
	if math.IsNaN(half) {
		return 0
	}
	return half
}

func Check(value float64) bool {
	return math.IsNaN(value)
}
