/**
 * Inverted highlighting — bold the UNTYPED part (what sugester adds).
 * User types "canon eos r" → suggestion renders: canon eos r<strong>5 mark ii</strong>
 * Focuses user attention on differences between suggestions.
 */

/**
 * Highlight a suggestion by bolding the part NOT typed by the user.
 * @param {string} suggestion - The full suggestion text
 * @param {string} query - What the user typed
 * @returns {string} HTML string with <strong> around untyped portion
 */
export function highlightInverted(suggestion, query) {
  if (!suggestion || !query) return escapeHtml(suggestion || '');

  const suggestionLower = suggestion.toLowerCase();
  const queryLower = query.toLowerCase().trim();

  // Find where the query matches in the suggestion
  const matchIndex = suggestionLower.indexOf(queryLower);

  if (matchIndex === -1) {
    // No direct match — bold the entire suggestion
    return `<strong>${escapeHtml(suggestion)}</strong>`;
  }

  const beforeMatch = suggestion.slice(0, matchIndex);
  const matched = suggestion.slice(matchIndex, matchIndex + queryLower.length);
  const afterMatch = suggestion.slice(matchIndex + queryLower.length);

  let html = '';

  if (beforeMatch) {
    html += `<strong>${escapeHtml(beforeMatch)}</strong>`;
  }

  html += escapeHtml(matched);

  if (afterMatch) {
    html += `<strong>${escapeHtml(afterMatch)}</strong>`;
  }

  return html;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { escapeHtml };
