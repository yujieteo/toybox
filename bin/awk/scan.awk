function on(r) { return index(nrules, " " r " ") > 0 }

function emit(r, msg) {
  if (on(r)) { print file ":" FNR ": " r ": " msg; found++ }
}

function scrub(s) {
  gsub(/\\./, "", s)
  gsub(/"[^"]*"/, "\"\"", s)
  if (lang == "go" || lang == "rs") gsub(/'(\\.|[^'\\])'/, "''", s)
  else gsub(/'[^']*'/, "''", s)
  if (lang == "go" || lang == "ts") gsub(/`[^`]*`/, "``", s)
  return s
}

function cut_c(s,   out, i, j) {
  out = ""
  while (length(s) > 0) {
    i = index(s, "/*")
    j = index(s, "//")
    if (inblock) {
      i = index(s, "*/")
      if (i == 0) { ctext = ctext s; return out }
      ctext = ctext substr(s, 1, i - 1)
      s = substr(s, i + 2)
      inblock = 0
    } else if (j > 0 && (i == 0 || j < i)) {
      ctext = ctext substr(s, j + 2)
      return out substr(s, 1, j - 1)
    } else if (i == 0) {
      return out s
    } else {
      out = out substr(s, 1, i - 1)
      s = substr(s, i + 2)
      inblock = 1
    }
  }
  return out
}

function cut_hash(s) {
  if (match(s, /(^|[ \t])#|[^$#{"]#[ A-Za-z]/)) {
    ctext = substr(s, RSTART + RLENGTH)
    return substr(s, 1, RSTART - 1)
  }
  return s
}

function triples(s,   n) {
  n = gsub(/"""|'''/, "&", s)
  return n
}

function doc_line(s,   n) {
  n = triples(s)
  if (indoc) {
    if (n % 2 == 1) indoc = 0
    return 1
  }
  if (s ~ /^[ \t]*[rR]?("""|''')/) {
    if (n % 2 == 1) indoc = 1
    return 1
  }
  return 0
}

function comment_ok(s) {
  if (FNR == 1 && raw ~ /^#!/) return 1
  if (lang == "go" && raw ~ /^\/\/go:/) return 1
  if (lang == "ts" && raw ~ /^\/\/\/[ \t]*<reference/) return 1
  if (lang == "py" && ctext ~ /^[ \t]*-\*- coding/) return 1
  return ctext ~ /^[ \t]*(Source|Credit|Licen[sc]e|Copyright|SPDX-License-Identifier)[: \t]/ && ctext ~ /(https?:\/\/|SPDX|Copyright \(c\))/
}

function split_line(s,   t) {
  ctext = ""
  t = scrub(s)
  if (lang == "py" && doc_line(s)) { ctext = s; return "" }
  if (lang == "go" || lang == "ts" || lang == "rs") return cut_c(t)
  return cut_hash(t)
}

function check_comment(s) {
  if (ctext != "" || (lang == "py" && s == "" && raw ~ /"""|'''/)) {
    if (!comment_ok(ctext)) emit("comment", "comment found: make the code say it")
  }
  if (raw ~ SUPPRESS) emit("suppress", "a line that turns a check off")
}

BEGIN {
  nrules = " " rules " "
  SUPPRESS = suppress
}

{
  raw = $0
  code = split_line(raw)
  check_comment(code)
  track_function(code)
  line_rules(code)
  hot_rules(code)
}

END {
  fn_finish()
  if (FNR > maxfile) emit("filesize", FNR " lines, limit " maxfile)
  exit found > 0
}
