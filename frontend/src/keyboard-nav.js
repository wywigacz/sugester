/**
 * WAI-ARIA combobox keyboard navigation.
 * role="combobox" on input, role="listbox" on dropdown, role="option" on items.
 * Arrow keys navigate across all sections, Enter selects, Escape closes.
 * Active suggestion text is copied to input on arrow navigation.
 */

export class KeyboardNav {
  constructor({ input, dropdown, listbox, onSelect, onEscape, onEnterNoSelection }) {
    this.input = input;
    this.dropdown = dropdown;
    this.listbox = listbox;
    this.onSelect = onSelect;
    this.onEscape = onEscape;
    this.onEnterNoSelection = onEnterNoSelection;
    this.originalValue = '';

    this._setupAria();
    this._bindKeys();
  }

  _setupAria() {
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.setAttribute('aria-haspopup', 'listbox');

    if (this.listbox) {
      this.listbox.setAttribute('role', 'listbox');
    }

    // Aria-live region for screen reader announcements
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = 'sugester-sr-only';
    this.input.parentNode.insertBefore(this.liveRegion, this.input.nextSibling);
  }

  _bindKeys() {
    this.input.addEventListener('keydown', (e) => {
      if (!this.dropdown.isVisible()) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          // Open dropdown on ArrowDown
          return;
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this._navigate(1);
          break;

        case 'ArrowUp':
          e.preventDefault();
          this._navigate(-1);
          break;

        case 'Enter':
          e.preventDefault();
          this._selectActive();
          break;

        case 'Escape':
          e.preventDefault();
          this._escape();
          break;

        case 'Tab':
          this.dropdown.hide();
          this.updateExpanded(false);
          break;
      }
    });
  }

  _navigate(direction) {
    const activeId = this.dropdown.moveActive(direction);

    if (activeId) {
      this.input.setAttribute('aria-activedescendant', activeId);
      // Copy active suggestion text to input
      const text = this.dropdown.getActiveText();
      if (text) {
        this.input.value = text;
      }
    } else {
      this.input.removeAttribute('aria-activedescendant');
      // Restore original input
      this.input.value = this.originalValue;
    }
  }

  _selectActive() {
    const item = this.dropdown.getActiveItem();
    if (item) {
      this.onSelect?.(item);
    } else {
      this.onEnterNoSelection?.();
    }
  }

  _escape() {
    this.input.value = this.originalValue;
    this.dropdown.hide();
    this.updateExpanded(false);
    this.input.removeAttribute('aria-activedescendant');
    this.onEscape?.();
  }

  /**
   * Save the current input value before navigation starts.
   */
  saveOriginalValue() {
    this.originalValue = this.input.value;
  }

  /**
   * Update aria-expanded state.
   */
  updateExpanded(expanded) {
    this.input.setAttribute('aria-expanded', String(expanded));
  }

  /**
   * Announce results count for screen readers.
   */
  announceResults(count) {
    if (count === 0) {
      this.liveRegion.textContent = 'Brak wynik\u00F3w';
    } else {
      this.liveRegion.textContent = `${count} wynik\u00F3w dost\u0119pnych`;
    }
  }
}
