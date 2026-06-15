/**
 * Returns the page numbers to render given current page and total pages.
 * Always shows first, last, current, and one page on each side of current.
 * Gaps are represented as `null` (rendered as ellipsis).
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number
): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)
  for (
    let i = Math.max(2, currentPage - 1);
    i <= Math.min(totalPages - 1, currentPage + 1);
    i++
  ) {
    pages.add(i)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | null)[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) {
      result.push(null)
    }
    result.push(sorted[i]!)
  }
  return result
}
