function hot_rules(s) {
  if (!hot) return
  if (lang == "go") hot_go(s)
  else if (lang == "ts") hot_ts(s)
  else if (lang == "rs") hot_rs(s)
}

function alloc(s, re, why) {
  if (hit(s, re)) emit("hotalloc", why " allocates in a .hot. file")
}

function hot_go(s) {
  alloc(s, "(^|[^A-Za-z0-9_.])(make|new|append)\\(", "make, new or append")
  alloc(s, "&[A-Za-z_.]+(\\[[^]]*\\])?\\{", "an address of a literal")
  alloc(s, "\\[\\][A-Za-z_.*]+\\{|map\\[", "a slice or map literal")
  alloc(s, "(^|[^A-Za-z0-9_])(fmt|errors|strings|strconv|sort)\\.", "a library call")
  alloc(s, "(^|[^A-Za-z0-9_.])(string|\\[\\]byte|\\[\\]rune)\\(", "a conversion")
  alloc(s, "(^|[^A-Za-z0-9_])(go|defer|select)[ \t]", "go, defer or select")
}

function hot_ts(s) {
  alloc(s, "(^|[^A-Za-z0-9_.])new[ \t]", "new")
  alloc(s, "[=(,:?]([ \t]*)\\{|return[ \t]+\\{|\\{[ \t]*[A-Za-z_]+[ \t]*:", "an object literal")
  alloc(s, "[=(,:?]([ \t]*)\\[|return[ \t]+\\[", "an array literal")
  alloc(s, "`|\\.\\.\\.", "a template string or a spread")
  alloc(s, "\\+[ \t]*(\"|')|(\"|')[ \t]*\\+", "string concatenation")
  alloc(s, "\\.(slice|concat|split|join|push|splice|toString|toFixed|substring|substr|padStart|padEnd|repeat|trim)\\(", "an array or string method")
  alloc(s, "(Array|Object|JSON|Promise|Symbol|String|Number)\\.[a-zA-Z]+|(^|[^A-Za-z0-9_])(async|await)([^A-Za-z0-9_]|$)", "a library call")
}

function hot_rs(s) {
  alloc(s, "(Vec|Box|String|Rc|Arc|HashMap|BTreeMap|HashSet|VecDeque)::", "a heap type")
  alloc(s, "(vec|format|println|print|eprintln)!", "vec! or format!")
  alloc(s, "\\.(to_string|to_owned|to_vec|collect|clone|push|push_str|into_boxed_slice|into|join|concat|to_uppercase|to_lowercase|repeat|replace)\\(", "a copying method")
}
