// ==========================================================================
// AssistiveTouch Floating & Movable Menu (Apple iOS Style)
// Shared across all pages: index.html, province-breakdown.html, municipality-breakdown.html
// ==========================================================================

(function initAssistiveTouchModule() {
  const MENU_ITEMS = [
    {
      id: "overview",
      label: "All Contests",
      desc: "Regional Overview & Totals",
      icon: "layout-grid",
      colorClass: "icon-blue",
      page: "index.html"
    },
    {
      id: "province",
      label: "By Province",
      desc: "6 Provinces & SGA Totals",
      icon: "map",
      colorClass: "icon-gold",
      page: "province-breakdown.html"
    },
    {
      id: "municipality",
      label: "By City/Municipality",
      desc: "116 Municipalities Tabulation",
      icon: "building-2",
      colorClass: "icon-green",
      page: "municipality-breakdown.html"
    },
    {
      id: "barangay",
      label: "By Barangay",
      desc: "Barangay-Level Returns",
      icon: "home",
      colorClass: "icon-purple",
      page: "barangay-breakdown.html"
    },
    {
      id: "er",
      label: "By Election Returns",
      desc: "Precinct-Level Tabulation",
      icon: "file-spreadsheet",
      colorClass: "icon-red",
      page: "election-returns-breakdown.html"
    }
  ];

  function getCurrentPageKey() {
    const page = window.location.pathname.split("/").pop() || "index.html";
    if (page === "" || page === "index.html") return "overview";
    if (page.startsWith("province")) return "province";
    if (page.startsWith("municipality")) return "municipality";
    if (page.startsWith("barangay")) return "barangay";
    if (page.startsWith("election-returns")) return "er";
    return "";
  }

  function setup() {
    const assistiveWidget = document.querySelector("#assistive-widget");
    const assistiveTouchBtn = document.querySelector("#assistive-touch");
    const assistiveMenu = document.querySelector("#assistive-menu");

    if (!assistiveWidget || !assistiveTouchBtn) return;

    let isDragging = false;
    let hasMoved = false;
    let startPointerX = 0;
    let startPointerY = 0;
    let widgetStartX = 0;
    let widgetStartY = 0;
    let lastToggleTimestamp = 0;

    // Restore saved position if available or set responsive default
    const savedPos = sessionStorage.getItem("assistive_touch_pos");
    const widgetWidth = assistiveWidget.offsetWidth || 52;
    const widgetHeight = assistiveWidget.offsetHeight || 52;
    const margin = window.innerWidth <= 680 ? 12 : 16;
    const maxX = Math.max(margin, window.innerWidth - widgetWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - widgetHeight - margin);

    if (savedPos) {
      try {
        const parsed = JSON.parse(savedPos);
        let validX, validY;
        if (typeof parsed.ratioX === "number" && typeof parsed.ratioY === "number") {
          validX = margin + Math.round(parsed.ratioX * (maxX - margin));
          validY = margin + Math.round(parsed.ratioY * (maxY - margin));
        } else {
          validX = Math.min(parsed.x, maxX);
          validY = Math.min(parsed.y, maxY);
        }
        validX = Math.max(margin, Math.min(validX, maxX));
        validY = Math.max(margin, Math.min(validY, maxY));

        assistiveWidget.style.left = `${validX}px`;
        assistiveWidget.style.top = `${validY}px`;
        assistiveWidget.style.right = "auto";
        assistiveWidget.style.bottom = "auto";
      } catch {
        assistiveWidget.style.right = window.innerWidth <= 680 ? "16px" : "28px";
        assistiveWidget.style.bottom = window.innerWidth <= 680 ? "18px" : "28px";
      }
    } else {
      assistiveWidget.style.right = window.innerWidth <= 680 ? "16px" : "28px";
      assistiveWidget.style.bottom = window.innerWidth <= 680 ? "18px" : "28px";
    }

    function closeAssistiveMenu() {
      if (assistiveMenu) assistiveMenu.hidden = true;
    }

    function renderAssistiveMenu() {
      if (!assistiveMenu) return;
      const currentKey = getCurrentPageKey();

      const headerHtml = `
        <div class="assistive-menu-header">
          <div class="assistive-menu-grab-pill"></div>
          <div class="assistive-header-title-wrap">
            <span class="assistive-apple-pill"><span class="assistive-apple-pill-dot"></span> ASSISTIVE NAVIGATION</span>
            <span class="assistive-menu-title">Select Breakdown Level</span>
          </div>
        </div>
      `;

      const listHtml = MENU_ITEMS.map((item) => {
        const isCurrent = item.id === currentKey;
        return `
          <button type="button" class="assistive-item ${isCurrent ? 'is-current' : ''}" data-level="${item.id}">
            <div class="assistive-item-icon ${item.colorClass}">
              <i data-lucide="${item.icon}"></i>
            </div>
            <div class="assistive-item-content">
              <span class="assistive-item-label">${item.label}</span>
              <span class="assistive-item-desc">${item.desc}</span>
            </div>
            <div class="assistive-item-trailing">
              ${isCurrent ? '<span class="assistive-active-badge">Active</span>' : ''}
              <i data-lucide="chevron-right" class="assistive-chevron"></i>
            </div>
          </button>
        `;
      }).join("");

      const footerHtml = `
        <div class="assistive-menu-footer">
          <span class="assistive-tip">
            <i data-lucide="move"></i> Drag bubble anywhere &bull; Tap level to open
          </span>
        </div>
      `;

      assistiveMenu.innerHTML = headerHtml + `<div class="assistive-menu-list">${listHtml}</div>` + footerHtml;

      // Bind navigation items
      assistiveMenu.querySelectorAll(".assistive-item").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const level = btn.getAttribute("data-level");
          closeAssistiveMenu();
          const targetItem = MENU_ITEMS.find((i) => i.id === level);
          if (!targetItem) return;

          const currentPage = window.location.pathname.split("/").pop() || "index.html";
          const isTargetActive = (currentPage === targetItem.page) || (targetItem.page === "index.html" && currentPage === "");

          if (!isTargetActive) {
            window.location.assign(new URL(targetItem.page, window.location.href).href);
          } else {
            if (targetItem.id === "overview") {
              const allTab = document.querySelector('.tab-btn[data-cat="all"]');
              if (allTab) allTab.click();
              document.querySelector(".result-section")?.scrollIntoView({ behavior: "smooth" });
            } else {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }
        });
      });

      if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
      }
    }

    // Automatically follow the bubble with Zero-Clipping Viewport Clamping
    function adjustMenuPlacement() {
      if (!assistiveMenu || assistiveMenu.hidden) return;

      const widgetRect = assistiveWidget.getBoundingClientRect();
      const widgetTop = typeof widgetRect.top === "number" ? widgetRect.top : 0;
      const widgetLeft = typeof widgetRect.left === "number" ? widgetRect.left : 0;
      const widgetWidth = typeof widgetRect.width === "number" ? widgetRect.width : (assistiveWidget.offsetWidth || 52);
      const widgetHeight = typeof widgetRect.height === "number" ? widgetRect.height : (assistiveWidget.offsetHeight || 52);

      const screenWidth = window.innerWidth || 375;
      const screenHeight = window.innerHeight || 667;
      const margin = screenWidth <= 480 ? 10 : 14;

      // Desired menu width, constrained strictly within screen width
      const menuWidth = Math.min(310, screenWidth - (margin * 2));
      assistiveMenu.style.width = `${menuWidth}px`;
      assistiveMenu.style.maxWidth = `calc(100vw - ${margin * 2}px)`;

      // Ideal screen position: centered horizontally above/below the bubble
      const widgetCenterX = widgetLeft + (widgetWidth / 2);
      const idealScreenLeft = widgetCenterX - (menuWidth / 2);

      // Clamp strictly inside screen bounds [margin, screenWidth - margin - menuWidth]
      const clampedScreenLeft = Math.max(margin, Math.min(idealScreenLeft, screenWidth - margin - menuWidth));

      // Calculate relative horizontal offset inside the widget container
      const relativeLeft = clampedScreenLeft - widgetLeft;

      assistiveMenu.style.left = `${Math.round(relativeLeft)}px`;
      assistiveMenu.style.right = "auto";
      assistiveMenu.style.transform = "none";

      // Vertical placement:
      // If widget is in the lower half of screen, open ABOVE the bubble
      const spaceAbove = widgetTop - margin;
      const spaceBelow = screenHeight - (widgetTop + widgetHeight) - margin;

      if (spaceAbove > 300 || spaceAbove > spaceBelow) {
        // Open upwards directly above the bubble
        assistiveMenu.style.bottom = "calc(100% + 12px)";
        assistiveMenu.style.top = "auto";
      } else {
        // Open downwards directly below the bubble
        assistiveMenu.style.top = "calc(100% + 12px)";
        assistiveMenu.style.bottom = "auto";
      }
    }

    function toggleAssistiveMenu() {
      if (!assistiveMenu) return;
      const isOpening = assistiveMenu.hidden;
      if (isOpening) {
        renderAssistiveMenu();
        assistiveMenu.hidden = false;
        adjustMenuPlacement();
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(adjustMenuPlacement);
        }
      } else {
        assistiveMenu.hidden = true;
      }
    }

    function safeToggleAssistiveMenu() {
      const now = Date.now();
      if (now - lastToggleTimestamp < 250) return;
      lastToggleTimestamp = now;
      toggleAssistiveMenu();
    }

    // Pointer events for dragging
    assistiveTouchBtn.addEventListener("pointerdown", (e) => {
      if (e.cancelable) e.preventDefault();
      isDragging = true;
      hasMoved = false;
      startPointerX = e.clientX;
      startPointerY = e.clientY;

      const rect = assistiveWidget.getBoundingClientRect();
      widgetStartX = rect.left;
      widgetStartY = rect.top;

      assistiveWidget.style.transition = "none";
      assistiveTouchBtn.classList.add("dragging");
      document.body.classList.add("assistive-dragging-active");
      try {
        assistiveTouchBtn.setPointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    });

    assistiveTouchBtn.addEventListener("pointermove", (e) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();
      const deltaX = e.clientX - startPointerX;
      const deltaY = e.clientY - startPointerY;

      if (Math.hypot(deltaX, deltaY) > 5) {
        hasMoved = true;
      }

      let newX = widgetStartX + deltaX;
      let newY = widgetStartY + deltaY;

      // Clamp inside viewport
      const maxX = window.innerWidth - (assistiveWidget.offsetWidth || 58) - 8;
      const maxY = window.innerHeight - (assistiveWidget.offsetHeight || 58) - 8;
      newX = Math.max(8, Math.min(newX, maxX));
      newY = Math.max(8, Math.min(newY, maxY));

      assistiveWidget.style.left = `${newX}px`;
      assistiveWidget.style.top = `${newY}px`;
      assistiveWidget.style.right = "auto";
      assistiveWidget.style.bottom = "auto";

      if (assistiveMenu && !assistiveMenu.hidden) {
        adjustMenuPlacement();
      }
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      if (e && e.cancelable) e.preventDefault();
      isDragging = false;
      assistiveTouchBtn.classList.remove("dragging");
      document.body.classList.remove("assistive-dragging-active");

      try {
        if (e && e.pointerId) {
          assistiveTouchBtn.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignored
      }

      if (hasMoved) {
        // Drop freely anywhere on screen
        const rect = assistiveWidget.getBoundingClientRect();
        const widgetWidth = assistiveWidget.offsetWidth || 52;
        const widgetHeight = assistiveWidget.offsetHeight || 52;
        const margin = window.innerWidth <= 680 ? 12 : 16;
        const maxX = Math.max(margin, window.innerWidth - widgetWidth - margin);
        const maxY = Math.max(margin, window.innerHeight - widgetHeight - margin);
        const freeX = Math.max(margin, Math.min(rect.left, maxX));
        const freeY = Math.max(margin, Math.min(rect.top, maxY));

        assistiveWidget.style.transition = "none";
        assistiveWidget.style.left = `${freeX}px`;
        assistiveWidget.style.top = `${freeY}px`;
        assistiveWidget.style.right = "auto";
        assistiveWidget.style.bottom = "auto";

        const ratioX = maxX > margin ? (freeX - margin) / (maxX - margin) : 1;
        const ratioY = maxY > margin ? (freeY - margin) / (maxY - margin) : 1;

        sessionStorage.setItem("assistive_touch_pos", JSON.stringify({
          x: freeX,
          y: freeY,
          ratioX,
          ratioY
        }));
        adjustMenuPlacement();
      } else {
        safeToggleAssistiveMenu();
      }
    };

    assistiveTouchBtn.addEventListener("pointerup", endDrag);
    assistiveTouchBtn.addEventListener("pointercancel", endDrag);

    // Pointer-up is the single tap handler. A following click must not toggle again.
    assistiveTouchBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Prevent native touch scrolling when touching or dragging the assistive touch button
    assistiveTouchBtn.addEventListener("touchstart", (e) => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    assistiveTouchBtn.addEventListener("touchmove", (e) => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    // Block any page scroll attempts while assistive touch is being dragged
    window.addEventListener("touchmove", (e) => {
      if (isDragging && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener("wheel", (e) => {
      if (isDragging && e.cancelable) {
        e.preventDefault();
      }
    }, { passive: false });

    // Prevent native browser drag operations on widget
    assistiveWidget.addEventListener("dragstart", (e) => {
      e.preventDefault();
    });

    // Close on click outside
    document.addEventListener("click", (e) => {
      if (assistiveMenu && !assistiveMenu.hidden) {
        if (!assistiveWidget.contains(e.target) && !assistiveMenu.contains(e.target)) {
          closeAssistiveMenu();
        }
      }
    });

    // Close on Escape
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAssistiveMenu();
      }
    });

    // Dynamically adjust AssistiveTouch when the screen is shrinking or resized
    function handleScreenShrinkOrResize() {
      const widgetWidth = assistiveWidget.offsetWidth || 52;
      const widgetHeight = assistiveWidget.offsetHeight || 52;
      const margin = window.innerWidth <= 680 ? 12 : 16;
      const maxX = Math.max(margin, window.innerWidth - widgetWidth - margin);
      const maxY = Math.max(margin, window.innerHeight - widgetHeight - margin);

      const saved = sessionStorage.getItem("assistive_touch_pos");
      let targetX, targetY;

      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (typeof parsed.ratioX === "number" && typeof parsed.ratioY === "number") {
            targetX = margin + Math.round(parsed.ratioX * (maxX - margin));
            targetY = margin + Math.round(parsed.ratioY * (maxY - margin));
          } else {
            targetX = Math.min(parsed.x, maxX);
            targetY = Math.min(parsed.y, maxY);
          }
        } catch {
          targetX = maxX;
          targetY = maxY;
        }
      } else {
        const rect = assistiveWidget.getBoundingClientRect();
        targetX = Math.min(rect.left, maxX);
        targetY = Math.min(rect.top, maxY);
      }

      targetX = Math.max(margin, Math.min(targetX, maxX));
      targetY = Math.max(margin, Math.min(targetY, maxY));

      assistiveWidget.style.transition = "none";
      assistiveWidget.style.left = `${targetX}px`;
      assistiveWidget.style.top = `${targetY}px`;
      assistiveWidget.style.right = "auto";
      assistiveWidget.style.bottom = "auto";

      adjustMenuPlacement();
    }

    window.addEventListener("resize", handleScreenShrinkOrResize);
    window.addEventListener("orientationchange", () => {
      setTimeout(handleScreenShrinkOrResize, 100);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
