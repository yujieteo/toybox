pub fn fact(n: u32) -> u32 {
    if n < 2 {
        return 1;
    }
    n * fact(n - 1)
}
