package main

func apply(f func(int) int, x int) int {
	return f(x)
}
