/**
 * Debounced API client with AbortController + client-side cache.
 * Cancels in-flight requests on new keystrokes.
 * Client cache eliminates backspace re-requests (instant from Map).
 */

export class ApiClient {
  constructor({ apiUrl, debounceMs = 200 }) {
    this.apiUrl = apiUrl;
    this.debounceMs = debounceMs;
    this.cache = new Map();
    this.maxCacheSize = 100;
    this.controller = null;
    this.debounceTimer = null;
  }

  /**
   * Fetch autocomplete results with debounce + AbortController.
   * Returns a Promise that resolves with the API response.
   */
  fetchAutocomplete(query, limit = 5) {
    return new Promise((resolve, reject) => {
      // Check client-side cache first (instant — skip debounce)
      const cacheKey = `ac:${query}:${limit}`;
      if (this.cache.has(cacheKey)) {
        resolve(this.cache.get(cacheKey));
        return;
      }

      // Cancel previous debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      // Cancel previous in-flight request
      if (this.controller) {
        this.controller.abort();
      }

      this.debounceTimer = setTimeout(async () => {
        this.controller = new AbortController();

        try {
          const url = `${this.apiUrl}/autocomplete?q=${encodeURIComponent(query)}&limit=${limit}`;
          const response = await fetch(url, {
            signal: this.controller.signal,
            headers: { 'Accept': 'application/json' },
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          // Store in client cache
          this._cacheSet(cacheKey, data);

          resolve(data);
        } catch (err) {
          if (err.name === 'AbortError') {
            // Silently ignore aborted requests
            return;
          }
          reject(err);
        }
      }, this.debounceMs);
    });
  }

  /**
   * Fetch search results (no debounce — triggered on form submit).
   */
  async fetchSearch(query, params = {}) {
    const searchParams = new URLSearchParams({ q: query, ...params });
    const url = `${this.apiUrl}/search?${searchParams}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Fetch trending products/categories.
   */
  async fetchTrending(limit = 10) {
    const cacheKey = 'trending';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const url = `${this.apiUrl}/trending?limit=${limit}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    this._cacheSet(cacheKey, data);
    return data;
  }

  /**
   * Cancel all pending requests.
   */
  cancel() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  _cacheSet(key, value) {
    // Evict oldest entries if over max size
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
