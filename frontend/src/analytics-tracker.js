/**
 * Analytics event tracker — uses sendBeacon for reliability.
 * Tracks: search_performed, suggestion_clicked, product_clicked,
 *         category_clicked, zero_results, search_exit.
 */

const SESSION_KEY = 'sugester_session_id';

export class AnalyticsTracker {
  constructor({ analyticsUrl }) {
    this.analyticsUrl = analyticsUrl;
    this.sessionId = this._getOrCreateSessionId();
  }

  track(eventType, data = {}) {
    if (!this.analyticsUrl) return;

    const payload = {
      event_type: eventType,
      session_id: this.sessionId,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Use sendBeacon for reliability (survives page unload)
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(this.analyticsUrl, blob);
    } catch {
      // Fallback to fetch (sendBeacon not supported)
      fetch(this.analyticsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  }

  trackSearchPerformed(query, resultsCount) {
    this.track('search_performed', { query, results_count: resultsCount });
  }

  trackSuggestionClicked(query, suggestionText, section, position) {
    this.track('suggestion_clicked', { query, suggestion_text: suggestionText, section, position });
  }

  trackProductClicked(query, productId, position, price) {
    this.track('product_clicked', { query, product_id: productId, position, price });
  }

  trackCategoryClicked(query, categoryName) {
    this.track('category_clicked', { query, category_name: categoryName });
  }

  trackZeroResults(query) {
    this.track('zero_results', { query });
  }

  trackSearchExit(query, hadResults) {
    this.track('search_exit', { query, had_results: hadResults });
  }

  _getOrCreateSessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = crypto.randomUUID ? crypto.randomUUID() : this._generateUUID();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      return this._generateUUID();
    }
  }

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}
