/**
 * Recent searches — localStorage history (max 5 items).
 * Displays with relative timestamps ("wczoraj", "2 dni temu").
 */

const STORAGE_KEY = 'sugester_recent_searches';
const MAX_ITEMS = 5;

export class RecentSearches {
  constructor() {
    this.searches = this._load();
  }

  /**
   * Add a search query to history.
   */
  add(query) {
    const q = (query || '').trim();
    if (!q) return;

    // Remove duplicate if exists
    this.searches = this.searches.filter((s) => s.query !== q);

    // Add to front
    this.searches.unshift({
      query: q,
      timestamp: Date.now(),
    });

    // Trim to max
    if (this.searches.length > MAX_ITEMS) {
      this.searches = this.searches.slice(0, MAX_ITEMS);
    }

    this._save();
  }

  /**
   * Remove a specific query from history.
   */
  remove(query) {
    this.searches = this.searches.filter((s) => s.query !== query);
    this._save();
  }

  /**
   * Get all recent searches with relative timestamps.
   */
  getAll() {
    return this.searches.map((s) => ({
      query: s.query,
      timestamp: s.timestamp,
      timeAgo: this._formatTimeAgo(s.timestamp),
    }));
  }

  /**
   * Clear all history.
   */
  clear() {
    this.searches = [];
    this._save();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.searches));
    } catch {
      // localStorage full or unavailable
    }
  }

  _formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'przed chwilą';
    if (minutes < 60) return `${minutes} min temu`;
    if (hours < 24) return hours === 1 ? 'godzinę temu' : `${hours} godz. temu`;
    if (days === 1) return 'wczoraj';
    if (days < 7) return `${days} dni temu`;
    return `${Math.floor(days / 7)} tyg. temu`;
  }
}
