package textsplits

import (
	"bufio"
	"os"
	"strings"
)

func Lines(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return strings.Split(string(data), "\n"), nil // want newline-only-line-split
}

func Trimmed(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	text := strings.TrimSpace(string(data))
	return strings.Split(text, "\n"), nil // want newline-only-line-split
}

func FirstLine(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	text := string(data)
	line, _, _ := strings.Cut(text, "\n") // want newline-only-line-split
	return line, nil
}

func Normalised(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	return strings.Split(text, "\n"), nil
}

func Scanned(file *os.File) []string {
	var lines []string
	for scanner := bufio.NewScanner(file); scanner.Scan(); {
		lines = append(lines, scanner.Text())
	}
	return lines
}

func Built(items []string) []string { return strings.Split(strings.Join(items, "\n"), "\n") }

func Argument(text string) []string { return strings.Split(text, "\n") }
