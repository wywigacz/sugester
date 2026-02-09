/**
 * 3-column federated dropdown renderer (Cyfrowe.pl style).
 * Layout: Left (pills + categories) | Center (featured product) | Right (product grid)
 */

import { highlightInverted, escapeHtml } from './highlight.js';

export class Dropdown {
  constructor({ container, onSuggestionClick, onCategoryClick, onBrandClick, onProductClick, onShowAll }) {
    this.container = container;
    this.onSuggestionClick = onSuggestionClick;
    this.onCategoryClick = onCategoryClick;
    this.onBrandClick = onBrandClick;
    this.onProductClick = onProductClick;
    this.onShowAll = onShowAll;
    this.items = [];
    this.activeIndex = -1;
  }

  /**
   * Render the full 3-column dropdown from API response.
   */
  render(data, query) {
    this.items = [];
    this.activeIndex = -1;

    const hasSuggestions = data.suggestions && data.suggestions.length > 0;
    const hasCategories = data.categories && data.categories.length > 0;
    const hasBrands = data.brands && data.brands.length > 0;
    const hasProducts = data.products && data.products.length > 0;

    if (!hasSuggestions && !hasCategories && !hasBrands && !hasProducts) {
      this.container.innerHTML = '';
      return;
    }

    let html = '';

    // Close button
    html += '<button class="sugester-close" data-action="close" aria-label="Zamknij">&times;</button>';

    // 3-column body
    html += '<div class="sugester-body">';

    // Column 1: Zapytania (pills) + Kategorie + Brand
    html += '<div class="sugester-col-left">';
    if (hasSuggestions) {
      html += '<div class="sugester-section__label">Zapytania</div>';
      html += '<div class="sugester-pills">';
      data.suggestions.forEach((s) => {
        const id = `sugester-item-${this.items.length}`;
        const highlighted = highlightInverted(s.text, query);
        html += `<div class="sugester-pill" role="option" id="${id}" data-section="suggestion" data-index="${this.items.length}" data-text="${escapeHtml(s.text)}">${highlighted}</div>`;
        this.items.push({ type: 'suggestion', data: s, element: null });
      });
      html += '</div>';
    }

    if (hasCategories) {
      html += '<div class="sugester-section__label">Kategorie</div>';
      html += '<div class="sugester-cat-links">';
      data.categories.forEach((c) => {
        const id = `sugester-item-${this.items.length}`;
        html += `<div class="sugester-cat-link" role="option" id="${id}" data-section="category" data-index="${this.items.length}" data-text="${escapeHtml(c.name)}">`;
        html += `<span class="sugester-cat-link__arrow">&#9658;</span>`;
        html += `<span class="sugester-cat-link__name">${escapeHtml(c.name)}</span>`;
        html += `<span class="sugester-cat-link__count">${c.count}</span>`;
        html += `</div>`;
        this.items.push({ type: 'category', data: c, element: null });
      });
      html += '</div>';
    }

    if (hasBrands) {
      data.brands.forEach((b) => {
        const id = `sugester-item-${this.items.length}`;
        html += `<div class="sugester-brand-link" role="option" id="${id}" data-section="brand" data-index="${this.items.length}" data-text="${escapeHtml(b.name)}">`;
        html += `<span>Marka: <strong>${escapeHtml(b.name)}</strong></span>`;
        html += `<span class="sugester-cat-link__count">${b.count}</span>`;
        html += `</div>`;
        this.items.push({ type: 'brand', data: b, element: null });
      });
    }
    html += '</div>'; // end col-left

    // Column 2: Featured product (first product)
    if (hasProducts) {
      const featured = data.products[0];
      const featuredId = `sugester-item-${this.items.length}`;
      html += '<div class="sugester-col-center">';
      html += '<div class="sugester-section__label">Popularny produkt</div>';
      html += this._renderFeatured(featured, featuredId, query);
      this.items.push({ type: 'product', data: featured, element: null });
      html += '</div>'; // end col-center

      // Column 3: Product grid (remaining products)
      const gridProducts = data.products.slice(1);
      html += '<div class="sugester-col-right">';
      html += '<div class="sugester-section__label">Produkty</div>';
      if (gridProducts.length > 0) {
        html += '<div class="sugester-product-grid">';
        gridProducts.forEach((p) => {
          const id = `sugester-item-${this.items.length}`;
          html += this._renderGridItem(p, id, query);
          this.items.push({ type: 'product', data: p, element: null });
        });
        html += '</div>';
      }
      html += '</div>'; // end col-right
    } else {
      // Empty center + right if no products
      html += '<div class="sugester-col-center"></div>';
      html += '<div class="sugester-col-right"></div>';
    }

    html += '</div>'; // end sugester-body

    // "Show all results" link
    if (hasSuggestions || hasProducts) {
      html += `<div class="sugester-show-all">`;
      html += `<a href="#" class="sugester-show-all__link" data-action="show-all">Pokaż wszystkie wyniki &rarr;</a>`;
      html += `</div>`;
    }

    this.container.innerHTML = html;
    this._bindEvents();
  }

  /**
   * Render recent searches dropdown (single-column, no 3-column layout).
   */
  renderRecent(recentSearches) {
    this.items = [];
    this.activeIndex = -1;

    if (!recentSearches || recentSearches.length === 0) {
      this.container.innerHTML = '';
      return;
    }

    let html = '<div class="sugester-recent-list">';
    html += '<div class="sugester-section__label">Ostatnie wyszukiwania</div>';
    recentSearches.forEach((s) => {
      const id = `sugester-item-${this.items.length}`;
      html += `<div class="sugester-recent-item" role="option" id="${id}" data-section="recent" data-index="${this.items.length}" data-text="${escapeHtml(s.query)}">`;
      html += `<span class="sugester-recent-item__icon">&#128338;</span>`;
      html += `<span class="sugester-recent-item__text">${escapeHtml(s.query)}</span>`;
      html += `<span class="sugester-recent-item__time">${escapeHtml(s.timeAgo)}</span>`;
      html += `<button class="sugester-recent-item__remove" data-remove="${escapeHtml(s.query)}" aria-label="Usu\u0144">&times;</button>`;
      html += `</div>`;
      this.items.push({ type: 'recent', data: s, element: null });
    });
    html += '</div>';

    this.container.innerHTML = html;
    this._bindEvents();
  }

  /**
   * Render trending data (similar 3-column layout).
   */
  renderTrending(trendingData) {
    this.items = [];
    this.activeIndex = -1;

    const hasProducts = trendingData.products && trendingData.products.length > 0;
    const hasCategories = trendingData.categories && trendingData.categories.length > 0;

    if (!hasProducts && !hasCategories) {
      this.container.innerHTML = '';
      return;
    }

    let html = '<div class="sugester-body">';

    // Left column: categories
    html += '<div class="sugester-col-left">';
    if (hasCategories) {
      html += '<div class="sugester-section__label">Popularne kategorie</div>';
      html += '<div class="sugester-cat-links">';
      trendingData.categories.forEach((c) => {
        const id = `sugester-item-${this.items.length}`;
        html += `<div class="sugester-cat-link" role="option" id="${id}" data-section="category" data-index="${this.items.length}" data-text="${escapeHtml(c.name)}">`;
        html += `<span class="sugester-cat-link__arrow">&#9658;</span>`;
        html += `<span class="sugester-cat-link__name">${escapeHtml(c.name)}</span>`;
        html += `</div>`;
        this.items.push({ type: 'category', data: c, element: null });
      });
      html += '</div>';
    }
    html += '</div>';

    // Center: featured trending product
    if (hasProducts) {
      const featured = trendingData.products[0];
      const featuredId = `sugester-item-${this.items.length}`;
      html += '<div class="sugester-col-center">';
      html += '<div class="sugester-section__label">Popularny produkt</div>';
      html += this._renderFeatured(featured, featuredId, '');
      this.items.push({ type: 'product', data: featured, element: null });
      html += '</div>';

      // Right: grid
      const gridProducts = trendingData.products.slice(1, 5);
      html += '<div class="sugester-col-right">';
      html += '<div class="sugester-section__label">Popularne produkty</div>';
      if (gridProducts.length > 0) {
        html += '<div class="sugester-product-grid">';
        gridProducts.forEach((p) => {
          const id = `sugester-item-${this.items.length}`;
          html += this._renderGridItem(p, id, '');
          this.items.push({ type: 'product', data: p, element: null });
        });
        html += '</div>';
      }
      html += '</div>';
    }

    html += '</div>';

    this.container.innerHTML = html;
    this._bindEvents();
  }

  _renderFeatured(product, id, query) {
    const p = product;
    const name = query ? highlightInverted(p.name, query) : escapeHtml(p.name);
    const priceHtml = this._priceHtml(p, 'sugester-featured__price');

    let availBadge = this._availBadge(p);
    let pinnedLabel = p.is_pinned ? '<span class="sugester-badge sugester-badge--promo">Promowany</span>' : '';

    const imgSrc = p.has_image && p.image_url ? escapeHtml(p.image_url) : '';
    const imgHtml = imgSrc
      ? `<img class="sugester-featured__img" src="${imgSrc}" alt="" loading="lazy" width="180" height="180">`
      : '<div class="sugester-featured__img--placeholder">&#128247;</div>';

    let html = `<div class="sugester-featured" role="option" id="${id}" data-section="product" data-index="${this.items.length}" data-product-id="${escapeHtml(p.id || '')}">`;
    html += imgHtml;
    html += `<div class="sugester-featured__name">${name}</div>`;
    html += `<div class="sugester-featured__brand">${escapeHtml(p.brand || '')}</div>`;
    html += `<div class="sugester-featured__price">${priceHtml}</div>`;
    html += `<div class="sugester-featured__meta">${availBadge}${pinnedLabel}</div>`;
    html += `</div>`;

    return html;
  }

  _renderGridItem(product, id, query) {
    const p = product;
    const name = query ? highlightInverted(p.name, query) : escapeHtml(p.name);
    const priceHtml = this._priceHtml(p, 'sugester-grid-item__price');

    const imgSrc = p.has_image && p.image_url ? escapeHtml(p.image_url) : '';
    const imgHtml = imgSrc
      ? `<img class="sugester-grid-item__img" src="${imgSrc}" alt="" loading="lazy" width="80" height="80">`
      : '<div class="sugester-grid-item__img--placeholder">&#128247;</div>';

    let html = `<div class="sugester-grid-item" role="option" id="${id}" data-section="product" data-index="${this.items.length}" data-product-id="${escapeHtml(p.id || '')}">`;
    html += imgHtml;
    html += `<div class="sugester-grid-item__name">${name}</div>`;
    html += `<div class="sugester-grid-item__price">${priceHtml}</div>`;
    html += `</div>`;

    return html;
  }

  _priceHtml(p, className) {
    if (p.is_promo && p.sale_price) {
      return `<s class="sugester-price-old">${this._formatPrice(p.price)}</s> <span class="sugester-price-sale">${this._formatPrice(p.sale_price)}</span>`;
    }
    return `<span class="sugester-price">${this._formatPrice(p.price)}</span>`;
  }

  _availBadge(p) {
    if (p.availability === 'in_stock') {
      return '<span class="sugester-badge sugester-badge--green">Dost\u0119pny</span>';
    } else if (p.availability === 'na_zamowienie') {
      return '<span class="sugester-badge sugester-badge--yellow">Na zam\u00F3wienie</span>';
    } else {
      return '<span class="sugester-badge sugester-badge--gray">Niedost\u0119pny</span>';
    }
  }

  _formatPrice(price) {
    if (price == null) return '';
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price);
  }

  _bindEvents() {
    // Click on navigable items (pills, cat links, brand links, featured, grid items, recent items)
    const clickables = this.container.querySelectorAll('[data-section]');
    clickables.forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const section = el.dataset.section;
        const index = parseInt(el.dataset.index, 10);
        const item = this.items[index];
        if (!item) return;

        switch (section) {
          case 'suggestion':
          case 'recent':
            this.onSuggestionClick?.(item.data.text || item.data.query);
            break;
          case 'category':
            this.onCategoryClick?.(item.data.name || item.data);
            break;
          case 'brand':
            this.onBrandClick?.(item.data.name || item.data);
            break;
          case 'product':
            this.onProductClick?.(item.data, index);
            break;
        }
      });
    });

    // Remove recent search buttons
    this.container.querySelectorAll('.sugester-recent-item__remove').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const query = btn.dataset.remove;
        this.container.dispatchEvent(new CustomEvent('sugester:remove-recent', { detail: { query } }));
      });
    });

    // Show all link
    const showAllLink = this.container.querySelector('[data-action="show-all"]');
    if (showAllLink) {
      showAllLink.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.onShowAll?.();
      });
    }

    // Close button
    const closeBtn = this.container.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.hide();
      });
    }
  }

  getActiveItem() {
    if (this.activeIndex < 0 || this.activeIndex >= this.items.length) return null;
    return this.items[this.activeIndex];
  }

  getActiveText() {
    const el = this.container.querySelector('.sugester-item--active');
    return el?.dataset.text || null;
  }

  setActive(index) {
    const current = this.container.querySelector('.sugester-item--active');
    if (current) {
      current.classList.remove('sugester-item--active');
      current.removeAttribute('aria-selected');
    }

    this.activeIndex = index;

    if (index >= 0 && index < this.items.length) {
      const el = this.container.querySelector(`[data-index="${index}"]`);
      if (el) {
        el.classList.add('sugester-item--active');
        el.setAttribute('aria-selected', 'true');
        el.scrollIntoView({ block: 'nearest' });
        return el.id;
      }
    }
    return null;
  }

  moveActive(direction) {
    let newIndex = this.activeIndex + direction;
    if (newIndex < -1) newIndex = this.items.length - 1;
    if (newIndex >= this.items.length) newIndex = -1;
    return this.setActive(newIndex);
  }

  getItemCount() {
    return this.items.length;
  }

  show() {
    this.container.classList.add('sugester-dropdown--visible');
  }

  hide() {
    this.container.classList.remove('sugester-dropdown--visible');
    this.activeIndex = -1;
  }

  isVisible() {
    return this.container.classList.contains('sugester-dropdown--visible');
  }

  clear() {
    this.container.innerHTML = '';
    this.items = [];
    this.activeIndex = -1;
  }
}
