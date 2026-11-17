/** First letters of the words of a name, upper case (e.g. `Electro Dragon` → `ED`). */
export function initials(name: string, max = 2): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => [...word][0] ?? '')
    .join('')
    .slice(0, max)
    .toUpperCase();
}
