pub fn sum(xs: &[u32; 8]) -> u32 {
    let mut t = 0;
    for i in 0..8 {
        t += xs[i];
    }
    t
}
