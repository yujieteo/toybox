function syllables(w,   n, prev, i, c, v) {
  w = tolower(w)
  gsub(/[^a-z]/, "", w)
  if (w == "") return 0
  n = 0
  prev = 0
  for (i = 1; i <= length(w); i++) {
    c = substr(w, i, 1)
    v = (c ~ /[aeiouy]/)
    if (v && !prev) n++
    prev = v
  }
  if (w ~ /[^aeiouy]e$/ && !(w ~ /le$/) && n > 1) n--
  if (w ~ /(ed|es)$/ && !(w ~ /[td]ed$/) && n > 1) n--
  return n < 1 ? 1 : n
}

function clean(s) {
  gsub(/`[^`]*`/, " ", s)
  gsub(/!?\[[^]]*\]\([^)]*\)/, " ", s)
  gsub(/<[^>]*>/, " ", s)
  gsub(/https?:[^ ]*/, " ", s)
  gsub(/^[ \t]*([#>*+-]|[0-9]+\.)+[ \t]*/, "", s)
  gsub(/[*_|]/, " ", s)
  gsub(/-/, " ", s)
  return s
}

function count_line(s,   n, i, w, a) {
  s = clean(s)
  n = split(s, a, /[ \t]+/)
  for (i = 1; i <= n; i++) {
    w = a[i]
    if (w ~ /[A-Za-z]/) { words++; syl += syllables(w) }
  }
  sentences += gsub(/[.!?]+([ \t]|$)/, "&", s)
  if (s !~ /[.!?][ \t]*$/ && s ~ /[A-Za-z]/) sentences++
}

BEGIN { fence = 0; front = 0 }

FNR == 1 && $0 == "---" { front = 1; next }
front { if ($0 == "---") front = 0; next }
/^[ \t]*(```|~~~)/ { fence = !fence; next }
fence || /^[ \t]*\|[ \t]*-+/ { next }
{ count_line($0) }

END {
  if (words == 0) { print "0.0"; exit }
  if (sentences == 0) sentences = 1
  printf "%.1f\n", 0.39 * words / sentences + 11.8 * syl / words - 15.59
}
