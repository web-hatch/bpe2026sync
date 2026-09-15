// ==========================================================================
// Smooth Animated Civic Dropdown Component
// Replaces native OS select boxes with animated, rounded, accessible popovers
// ==========================================================================

export function initSmoothDropdown(dropdownEl) {
  if (!dropdownEl || dropdownEl.dataset.smoothDropdownInitialized === "true") return;

  const select = dropdownEl.querySelector("select");
  if (!select) return;

  dropdownEl.dataset.smoothDropdownInitialized = "true";

  const labelText = dropdownEl.querySelector(".smooth-dropdown-label")?.textContent || "";
  const isProvince = select.id === "province-select" || dropdownEl.dataset.type === "province" || labelText.toLowerCase().includes("province");
  if (isProvince) {
    dropdownEl.setAttribute("data-type", "province");
  }

  // Hide native select visually while keeping it in the DOM for event listeners and forms
  select.classList.add("smooth-native-hidden");

  // Remove any static chevrons in the markup so we manage one clean chevron inside the trigger
  const existingChevron = dropdownEl.querySelector(".smooth-dropdown-chevron");
  if (existingChevron) existingChevron.remove();

  // Create custom trigger button
  let trigger = dropdownEl.querySelector(".smooth-dropdown-trigger");
  if (!trigger) {
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "smooth-dropdown-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const currentText = document.createElement("span");
    currentText.className = "smooth-dropdown-current";
    trigger.appendChild(currentText);

    const chevron = document.createElement("span");
    chevron.className = "smooth-dropdown-chevron";
    chevron.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    trigger.appendChild(chevron);

    dropdownEl.appendChild(trigger);
  }

  // Create custom floating menu popover
  let menu = dropdownEl.querySelector(".smooth-dropdown-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "smooth-dropdown-menu";
    menu.setAttribute("role", "listbox");
    dropdownEl.appendChild(menu);
  }

  function syncOptions() {
    menu.replaceChildren();

    const currentVal = select.value;
    const selectedOption = select.options[select.selectedIndex];
    const currentSpan = trigger.querySelector(".smooth-dropdown-current");
    if (currentSpan) {
      const rawTxt = selectedOption ? selectedOption.textContent : (currentVal || "Select");
      currentSpan.textContent = isProvince ? rawTxt.toUpperCase() : rawTxt;
    }

    Array.from(select.options).forEach((opt) => {
      const itemBtn = document.createElement("button");
      itemBtn.type = "button";
      const isSelected = opt.value === currentVal;
      itemBtn.className = `smooth-dropdown-item ${isSelected ? "is-selected" : ""}`;
      itemBtn.setAttribute("role", "option");
      itemBtn.setAttribute("aria-selected", isSelected ? "true" : "false");

      const label = document.createElement("span");
      label.className = "item-label";
      label.textContent = isProvince ? opt.textContent.toUpperCase() : opt.textContent;

      const check = document.createElement("span");
      check.className = "item-check";
      check.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;

      itemBtn.append(label, check);

      itemBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (select.value !== opt.value) {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        close();
        syncOptions();
      });

      menu.appendChild(itemBtn);
    });
  }

  function open() {
    // Close other dropdowns
    document.querySelectorAll(".smooth-dropdown.is-open").forEach((d) => {
      if (d !== dropdownEl) {
        d.classList.remove("is-open");
        d.style.zIndex = "";
        const t = d.querySelector(".smooth-dropdown-trigger");
        if (t) t.setAttribute("aria-expanded", "false");
      }
    });

    syncOptions();
    dropdownEl.classList.add("is-open");
    dropdownEl.style.zIndex = "500";
    trigger.setAttribute("aria-expanded", "true");

    // Dynamic viewport boundary check on mobile/tablet
    if (menu) {
      const rect = dropdownEl.getBoundingClientRect();
      const menuWidth = Math.min(320, window.innerWidth - 32);
      if (rect.left + menuWidth > window.innerWidth - 12) {
        menu.style.left = "auto";
        menu.style.right = "0";
        menu.style.transformOrigin = "top right";
      } else {
        menu.style.left = "0";
        menu.style.right = "auto";
        menu.style.transformOrigin = "top left";
      }
    }
  }

  function close() {
    dropdownEl.classList.remove("is-open");
    dropdownEl.style.zIndex = "";
    trigger.setAttribute("aria-expanded", "false");
  }

  function toggle(e) {
    e.stopPropagation();
    if (dropdownEl.classList.contains("is-open")) {
      close();
    } else {
      open();
    }
  }

  trigger.addEventListener("click", toggle);
  dropdownEl.addEventListener("click", (e) => {
    // If user clicks anywhere on the pill container (except inside menu), toggle
    if (!e.target.closest(".smooth-dropdown-menu") && e.target !== trigger && !trigger.contains(e.target)) {
      toggle(e);
    }
  });

  // Watch for dynamic updates to select.options
  const observer = new MutationObserver(() => {
    syncOptions();
  });
  observer.observe(select, { childList: true, subtree: true, attributes: true });

  // Sync when select value changes programmatically
  select.addEventListener("change", () => {
    syncOptions();
  });

  // Initial sync
  syncOptions();

  return { open, close, sync: syncOptions };
}

export function initAllSmoothDropdowns() {
  document.querySelectorAll(".smooth-dropdown").forEach((el) => {
    initSmoothDropdown(el);
  });
}

if (typeof window !== "undefined") {
  window.initAllSmoothDropdowns = initAllSmoothDropdowns;
  window.initSmoothDropdown = initSmoothDropdown;
}

// Global outside-click and escape key handlers
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".smooth-dropdown")) {
      document.querySelectorAll(".smooth-dropdown.is-open").forEach((d) => {
        d.classList.remove("is-open");
        d.style.zIndex = "";
        const t = d.querySelector(".smooth-dropdown-trigger");
        if (t) t.setAttribute("aria-expanded", "false");
      });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".smooth-dropdown.is-open").forEach((d) => {
        d.classList.remove("is-open");
        d.style.zIndex = "";
        const t = d.querySelector(".smooth-dropdown-trigger");
        if (t) t.setAttribute("aria-expanded", "false");
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllSmoothDropdowns);
  } else {
    initAllSmoothDropdowns();
  }
}
