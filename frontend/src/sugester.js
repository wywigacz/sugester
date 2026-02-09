/**
 * SugesterWidget — Main widget class (IIFE export).
 *
 * Usage:
 * new SugesterWidget({
 *   inputSelector: '#search-input',
 *   apiUrl: 'http://localhost:3000/api',
 *   debounceMs: 200,
 *   minChars: 1,
 *   maxSuggestions: 10,
 *   onProductClick: (product) => {},
 *   onSearch: (query) => {},
 *   onCategoryClick: (category) => {},
 * });
 */

import { ApiClient } from './api-client.js';
import { Dropdown } from './dropdown.js';
import { KeyboardNav } from './keyboard-nav.js';
import { RecentSearches } from './recent-searches.js';
import { AnalyticsTracker } from './analytics-tracker.js';

export class SugesterWidget {
  constructor(options = {}) {
    this.options = {
      inputSelector: '#search-input',
      apiUrl: 'http://localhost:3000/api',
      analyticsUrl: null,
      debounceMs: 200,
      minChars: 1,
      maxSuggestions: 10,
      onProductClick: null,
      onSearch: null,
      onCategoryClick: null,
      ...options,
    };

    this.input = document.querySelector(this.options.inputSelector);
    if (!this.input) {
      console.error('SugesterWidget: Input not found:', this.options.inputSelector);
      return;
    }

    this._setup();
  }

  _setup() {
    // Create wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'sugester-wrapper';
    this.input.parentNode.insertBefore(this.wrapper, this.input);
    this.wrapper.appendChild(this.input);

    // Mobile header (hidden by default, shown on mobile)
    this.mobileHeader = document.createElement('div');
    this.mobileHeader.className = 'sugester-mobile-header';
    this.mobileHeader.innerHTML = '<button class="sugester-mobile-back" aria-label="Zamknij">&larr;</button>';
    this.wrapper.insertBefore(this.mobileHeader, this.input);
    this.mobileHeader.querySelector('.sugester-mobile-back').addEventListener('click', () => this._closeMobileOverlay());

    // Create dropdown container
    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'sugester-dropdown';
    this.dropdownEl.setAttribute('role', 'listbox');
    this.dropdownEl.id = 'sugester-listbox';
    this.wrapper.appendChild(this.dropdownEl);

    // Input type for mobile keyboard "Szukaj" button
    this.input.setAttribute('type', 'search');
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('aria-controls', 'sugester-listbox');

    // Initialize components
    this.apiClient = new ApiClient({
      apiUrl: this.options.apiUrl,
      debounceMs: this.options.debounceMs,
    });

    this.dropdown = new Dropdown({
      container: this.dropdownEl,
      onSuggestionClick: (text) => this._onSuggestionClick(text),
      onCategoryClick: (name) => this._onCategoryClick(name),
      onBrandClick: (name) => this._onBrandClick(name),
      onProductClick: (product, position) => this._onProductClick(product, position),
      onShowAll: () => this._onShowAll(),
    });

    this.keyboard = new KeyboardNav({
      input: this.input,
      dropdown: this.dropdown,
      listbox: this.dropdownEl,
      onSelect: (item) => this._onItemSelect(item),
      onEscape: () => this._onEscape(),
      onEnterNoSelection: () => this._onSubmit(),
    });

    this.recentSearches = new RecentSearches();

    this.analytics = new AnalyticsTracker({
      analyticsUrl: this.options.analyticsUrl
        ? this.options.analyticsUrl
        : this.options.apiUrl + '/analytics/event',
    });

    this.currentQuery = '';
    this.lastResults = null;

    this._bindEvents();
  }

  _bindEvents() {
    // Input event — main autocomplete trigger
    this.input.addEventListener('input', () => {
      const q = this.input.value.trim();
      this.currentQuery = q;
      this.keyboard.saveOriginalValue();

      if (q.length < this.options.minChars) {
        this.dropdown.clear();
        this.dropdown.hide();
        this.keyboard.updateExpanded(false);
        return;
      }

      this._fetchAutocomplete(q);
    });

    // Focus — show recent searches or trending
    this.input.addEventListener('focus', () => {
      this._openMobileOverlay();

      const q = this.input.value.trim();
      if (q.length >= this.options.minChars) {
        // Re-show existing results
        if (this.dropdown.getItemCount() > 0) {
          this.dropdown.show();
          this.keyboard.updateExpanded(true);
        }
        return;
      }

      // Empty input — show recent searches or trending
      const recent = this.recentSearches.getAll();
      if (recent.length > 0) {
        this.dropdown.renderRecent(recent);
        this.dropdown.show();
        this.keyboard.updateExpanded(true);
      } else {
        this._fetchTrending();
      }
    });

    // Blur — hide dropdown (with delay for click registration)
    this.input.addEventListener('blur', () => {
      setTimeout(() => {
        this.dropdown.hide();
        this.keyboard.updateExpanded(false);
        this._closeMobileOverlay();
      }, 200);
    });

    // Remove recent search event
    this.dropdownEl.addEventListener('sugester:remove-recent', (e) => {
      this.recentSearches.remove(e.detail.query);
      const recent = this.recentSearches.getAll();
      if (recent.length > 0) {
        this.dropdown.renderRecent(recent);
      } else {
        this.dropdown.clear();
        this.dropdown.hide();
        this.keyboard.updateExpanded(false);
      }
    });

    // Form submit
    const form = this.input.closest('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this._onSubmit();
      });
    }
  }

  async _fetchAutocomplete(query) {
    try {
      const data = await this.apiClient.fetchAutocomplete(query, this.options.maxSuggestions);
      if (!data) return;

      this.lastResults = data;
      this.dropdown.render(data, query);

      const totalItems = this.dropdown.getItemCount();
      if (totalItems > 0) {
        this.dropdown.show();
        this.keyboard.updateExpanded(true);
        this.keyboard.announceResults(totalItems);
      } else {
        this.dropdown.hide();
        this.keyboard.updateExpanded(false);
        this.keyboard.announceResults(0);
      }
    } catch (err) {
      // Silently handle errors (AbortError already handled in ApiClient)
      console.warn('Autocomplete fetch error:', err.message);
    }
  }

  async _fetchTrending() {
    try {
      const data = await this.apiClient.fetchTrending();
      if (data && (data.products?.length > 0 || data.categories?.length > 0)) {
        this.dropdown.renderTrending(data);
        this.dropdown.show();
        this.keyboard.updateExpanded(true);
      }
    } catch (err) {
      console.warn('Trending fetch error:', err.message);
    }
  }

  _onSuggestionClick(text) {
    this.input.value = text;
    this.currentQuery = text;
    this.dropdown.hide();
    this.keyboard.updateExpanded(false);
    this.recentSearches.add(text);
    this.analytics.trackSuggestionClicked(this.currentQuery, text, 'suggestion', 0);
    this.options.onSearch?.(text);
  }

  _onCategoryClick(name) {
    this.dropdown.hide();
    this.keyboard.updateExpanded(false);
    this.analytics.trackCategoryClicked(this.currentQuery, name);
    this.options.onCategoryClick?.(name);
  }

  _onBrandClick(name) {
    this.input.value = name;
    this.currentQuery = name;
    this.dropdown.hide();
    this.keyboard.updateExpanded(false);
    this._fetchAutocomplete(name);
  }

  _onProductClick(product, position) {
    this.dropdown.hide();
    this.keyboard.updateExpanded(false);
    this.analytics.trackProductClicked(this.currentQuery, product.id, position, product.price);
    this.options.onProductClick?.(product);
  }

  _onShowAll() {
    this._onSubmit();
  }

  _onItemSelect(item) {
    switch (item.type) {
      case 'suggestion':
      case 'recent':
        this._onSuggestionClick(item.data.text || item.data.query);
        break;
      case 'category':
        this._onCategoryClick(item.data.name);
        break;
      case 'brand':
        this._onBrandClick(item.data.name);
        break;
      case 'product':
        this._onProductClick(item.data, 0);
        break;
    }
  }

  _onEscape() {
    this._closeMobileOverlay();
  }

  _onSubmit() {
    const q = this.input.value.trim();
    if (!q) return;

    this.dropdown.hide();
    this.keyboard.updateExpanded(false);
    this._closeMobileOverlay();
    this.recentSearches.add(q);

    const resultsCount = this.lastResults?.products?.length || 0;
    this.analytics.trackSearchPerformed(q, resultsCount);

    if (resultsCount === 0) {
      this.analytics.trackZeroResults(q);
    }

    this.options.onSearch?.(q);
  }

  _openMobileOverlay() {
    if (window.innerWidth <= 768) {
      this.wrapper.classList.add('sugester-wrapper--mobile-open');
      document.body.style.overflow = 'hidden';
    }
  }

  _closeMobileOverlay() {
    this.wrapper.classList.remove('sugester-wrapper--mobile-open');
    document.body.style.overflow = '';
  }

  /**
   * Destroy widget and clean up.
   */
  destroy() {
    this.apiClient.cancel();
    this.dropdown.clear();
    this.wrapper.parentNode.insertBefore(this.input, this.wrapper);
    this.wrapper.remove();
  }
}

// Auto-expose on window for IIFE build
if (typeof window !== 'undefined') {
  window.SugesterWidget = SugesterWidget;
}
