export function formatDigestDate(date: Date, style: "long" | "short" = "short") {
  return new Intl.DateTimeFormat("en-SG", {
    day: style === "long" ? "2-digit" : "numeric",
    month: style === "long" ? "long" : "short",
    year: style === "long" ? "numeric" : undefined
  }).format(date);
}

export function normalizeDigestSlug(value: string) {
  return value.replace(/\.md$/i, "");
}
