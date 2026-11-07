pub fn f(g: u32) -> u32 {
    Some(1).map_or(0, g)
}
