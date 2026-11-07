function hit(s, re) { return s ~ re }

function line_rules(s) {
  if (lang == "go") go_rules(s)
  else if (lang == "ts") ts_rules(s)
  else if (lang == "py") py_rules(s)
  else if (lang == "rs") rs_rules(s)
  else if (lang == "sh") sh_rules(s)
  common_rules(s)
}

function common_rules(s) {
  if (hit(s, "(^|[^A-Za-z0-9_])goto[ \t]")) emit("goto", "goto breaks the control flow")
}

function go_rules(s) {
  if (hit(s, "^[ \t]*for[ \t]*\\{")) emit("loop", "a loop with no bound")
  if (!hit(s, "^[ \t]*for[ \t]") && (hit(s, "^[ \t]*_[ \t]*(,.*)?:?=") || hit(s, ",[ \t]*_[ \t]*:?="))) emit("ignored", "a returned value is dropped")
  if (hit(s, "^[ \t]*var[ \t]") && fnname == "") emit("scope", "a package variable: use the smallest scope")
  gsub(/^func[ \t]*(\([^)]*\)[ \t]*)?[A-Za-z0-9_]+(\[[^]]*\])?/, "", s)
  if (hit(s, "func[ \t]*\\(")) emit("fnvalue", "a function value")
  if (hit(s, "(^|[^A-Za-z0-9_.])unsafe\\.")) emit("macro", "unsafe is a hole in the type system")
}

function ts_rules(s) {
  if (hit(s, "while[ \t]*\\([ \t]*true[ \t]*\\)|for[ \t]*\\([ \t]*;[ \t]*;[ \t]*\\)")) emit("loop", "a loop with no bound")
  if (hit(s, "(^|[^A-Za-z0-9_])var[ \t]")) emit("scope", "var: use const")
  if (hit(s, "=>")) emit("fnvalue", "an arrow function")
  if (hit(s, "(^|[^A-Za-z0-9_.])function[ \t*(]") && !hit(s, "^[ \t]*(export[ \t]+)?(default[ \t]+)?(async[ \t]+)?function[ \t*]+[A-Za-z_]")) emit("fnvalue", "a function expression")
  if (hit(s, "\\.(map|filter|reduce|reduceRight|forEach|flatMap|some|every|find|findIndex|findLast|sort|toSorted|then|catch|finally)\\([^)]")) emit("fnvalue", "a method that takes a callback")
  if (hit(s, "catch[ \t]*(\\([^)]*\\))?[ \t]*\\{[ \t]*\\}")) emit("ignored", "an empty catch")
  if (hit(s, "(^|[^A-Za-z0-9_.])eval\\(|new[ \t]+Function\\(")) emit("macro", "code built at run time")
}

function py_rules(s) {
  if (hit(s, "while[ \t]+(True|1)[ \t]*:")) emit("loop", "a loop with no bound")
  if (hit(s, "^[ \t]*except[ \t]*:")) emit("ignored", "a bare except drops every error")
  if (hit(s, "(^|[^A-Za-z0-9_])global[ \t]")) emit("scope", "global: use the smallest scope")
  if (hit(s, "(^|[^A-Za-z0-9_])lambda([ \t:]|$)")) emit("fnvalue", "a lambda")
  if (hit(s, "(^|[^A-Za-z0-9_.])(map|filter|reduce)\\(|key[ \t]*=|Callable")) emit("fnvalue", "a function value")
  if (hit(s, "^[ \t]+(async[ \t]+)?def[ \t]") && fnindent > 0 && fnname != "") emit("fnvalue", "a nested function")
  if (hit(s, "(^|[^A-Za-z0-9_.])(eval|exec)\\(")) emit("macro", "code built at run time")
}

function rs_rules(s) {
  if (hit(s, "^[ \t]*loop[ \t]*\\{|while[ \t]+true")) emit("loop", "a loop with no bound")
  if (hit(s, "let[ \t]+_[ \t]*=|\\.ok\\(\\)[ \t]*;")) emit("ignored", "a result is dropped")
  if (hit(s, "static[ \t]+mut")) emit("scope", "static mut: use the smallest scope")
  if (hit(s, "macro_rules!")) emit("macro", "write a function, not a macro")
  if (hit(s, "(^|[(,=]|return|move)[ \t]*\\|[^|]*\\||[(,=][ \t]*\\|\\|")) emit("fnvalue", "a closure")
  if (hit(s, "(^|[^A-Za-z0-9_])(Fn|FnMut|FnOnce)([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_])fn[ \t]*\\(")) emit("fnvalue", "a function type")
  if (hit(s, "\\.(map|map_or|map_or_else|filter|for_each|fold|and_then|map_err|unwrap_or_else|ok_or_else|filter_map|flat_map|any|all|find|position|sort_by|sort_by_key|max_by|min_by|max_by_key|min_by_key|take_while|skip_while|retain|then|is_some_and|inspect)[ \t]*\\([^)]")) emit("fnvalue", "a method that takes a closure")
  if (hit(s, "unsafe[ \t]*(\\{|fn)")) emit("macro", "unsafe is a hole in the type system")
}

function sh_rules(s) {
  if (hit(s, "while[ \t]+(true|:)[ \t]*(;|$)")) emit("loop", "a loop with no bound")
  if (hit(s, "\\|\\|[ \t]*(true|:)[ \t]*($|;|\\))")) emit("ignored", "a failure is hidden")
  if (hit(s, "(^|[ \t;])eval[ \t]")) emit("macro", "code built at run time")
}
