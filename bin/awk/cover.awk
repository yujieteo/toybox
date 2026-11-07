function regex(p,   r) {
  r = p
  gsub(/\./, "\\.", r)
  gsub(/\*\*\//, "\001", r)
  gsub(/\*\*/, "\002", r)
  gsub(/\*/, "[^/]*", r)
  gsub(/\001/, "(.*/)?", r)
  gsub(/\002/, ".*", r)
  return "^" sub_slash(r) "(/.*)?$"
}
function sub_slash(r) {
  sub(/\/$/, "", r)
  return r
}
BEGIN {
  hidden = (f ~ /(^|\/)\.[^\/]/)
  n = split(pats, list, " ")
  for (i = 1; i <= n; i++) {
    if (hidden && list[i] !~ /^\./) continue
    if (list[i] == "." || f ~ regex(list[i])) exit 0
  }
  exit 1
}
