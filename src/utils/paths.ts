const baseUrl = import.meta.env.BASE_URL;

export function withBase(path = "/") {
  const normalizedBase = baseUrl === "/" ? "" : baseUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
