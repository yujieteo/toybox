function fn_name(s,   t) {
  t = s
  if (lang == "go") {
    if (t !~ /^func[ \t]/) return ""
    sub(/^func[ \t]*\([^)]*\)[ \t]*/, "func ", t)
    sub(/^func[ \t]+/, "", t)
    sub(/[^A-Za-z0-9_].*/, "", t)
    return t
  }
  if (lang == "rs") return match_name(t, "^[ \t]*(pub(\\([a-z]+\\))?[ \t]+)?((const|async|unsafe)[ \t]+)*fn[ \t]+")
  if (lang == "py") return match_name(t, "^[ \t]*(async[ \t]+)?def[ \t]+")
  if (lang == "sh") return shell_name(s) match_name(t, "^function[ \t]+")
  if (lang == "awk") return match_name(t, "^function[ \t]+")
  return ts_name(t)
}

function match_name(t, pre) {
  if (!match(t, pre)) return ""
  t = substr(t, RLENGTH + 1)
  sub(/[^A-Za-z0-9_].*/, "", t)
  return t
}

function shell_name(s) {
  if (s ~ /^[A-Za-z_][A-Za-z0-9_]*\(\)[ \t]*\{/) { sub(/\(.*/, "", s); return s }
  return ""
}

function ts_name(t,   n) {
  n = match_name(t, "^[ \t]*(export[ \t]+)?(default[ \t]+)?(async[ \t]+)?function[ \t*]+")
  if (n != "") return n
  if (t ~ /^[ \t]*((public|private|protected|static|async|readonly)[ \t]+)*[A-Za-z_][A-Za-z0-9_]*\(.*\)[^;=]*\{[ \t]*$/) {
    n = t
    sub(/^[ \t]*((public|private|protected|static|async|readonly)[ \t]+)*/, "", n)
    sub(/\(.*/, "", n)
    if (n !~ /^(if|for|while|switch|catch|function|return)$/) return n
  }
  return ""
}

function brace_delta(s,   o, c) {
  o = gsub(/\{/, "{", s)
  c = gsub(/\}/, "}", s)
  return o - c
}

function indent_of(s) {
  match(s, /^[ \t]*/)
  return RLENGTH
}

function fn_close(endline) {
  if (endline - fnstart + 1 > maxfn) {
    out = file ":" fnstart ": fnsize: function " fnname " has " endline - fnstart + 1 " lines, limit " maxfn
    if (on("fnsize")) { print out; found++ }
  }
  fnname = ""
}

function track_brace(s,   d) {
  if (index(s, "{") > 0) opened = 1
  depth += brace_delta(s)
  if (!opened && s ~ /;[ \t]*$/) fnname = ""
  else if (opened && depth <= 0) fn_close(FNR)
}

function track_end_marker(s) {
  if (s ~ /^}/) fn_close(FNR)
}

function track_py(s) {
  if (s ~ /^[ \t]*$/) return
  if (indent_of(s) <= fnindent) fn_close(lastbody)
  else lastbody = FNR
}

function start_fn(s, n) {
  fnname = n
  fnstart = FNR
  depth = 0
  opened = 0
  fnindent = indent_of(s)
  lastbody = FNR
  if (lang == "sh" || lang == "awk") {
    if (s ~ /\}[ \t]*$/) fn_close(FNR)
    return
  }
  if (lang != "py") track_brace(s)
}

function recursion(s) {
  if (s ~ ("(^|[^A-Za-z0-9_.])" fnname "[ \t]*\\(") || s ~ ("(this|self)\\." fnname "[ \t]*\\("))
    emit("recurse", fnname " calls itself")
  else if (lang == "sh" && s ~ ("^[ \t]*" fnname "([ \t;|&]|$)"))
    emit("recurse", fnname " calls itself")
}

function track_function(s,   n) {
  if (fnname != "") {
    if (lang == "py") track_py(raw)
    if (fnname != "") recursion(s)
    if (fnname != "" && lang != "py" && lang != "sh" && lang != "awk" && FNR > fnstart) track_brace(s)
    if (fnname != "" && (lang == "sh" || lang == "awk")) track_end_marker(raw)
    if (fnname != "") return
  }
  n = fn_name(s)
  if (n != "") start_fn(s, n)
}

function fn_finish() {
  if (fnname != "") fn_close(FNR)
}
