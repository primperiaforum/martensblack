// ── HERO CANVAS ANIMATION ─────────────────────────────────────────────────────
(function initHeroCanvas() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let W, H, particles, rafId, scanY = 0;

  const PARTICLE_COUNT = 90;
  const CONNECT_DIST   = 140;
  const SCAN_SPEED     = 0.5;
  const HEX_SIZE       = 46;
  const C_ORANGE       = [249, 115, 22];
  const C_WARM         = [244, 242, 237];

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  // ── Particles ──
  function makeParticle() {
    return {
      x:      Math.random() * W,
      y:      Math.random() * H,
      vx:     (Math.random() - 0.5) * 0.38,
      vy:     (Math.random() - 0.5) * 0.38 - 0.12,
      r:      Math.random() * 2.8 + 0.4,
      base:   Math.random() * 0.55 + 0.10,
      phase:  Math.random() * Math.PI * 2,
      dphase: 0.018 + Math.random() * 0.022,
      orange: Math.random() > 0.62,
    };
  }

  function resetParticle(p) {
    Object.assign(p, makeParticle());
    p.x = Math.random() * W;
    p.y = H + 10;
  }

  function updateParticle(p) {
    p.x += p.vx;
    p.y += p.vy;
    p.phase += p.dphase;
    if (p.y < -12 || p.x < -12 || p.x > W + 12) resetParticle(p);
  }

  function drawParticle(p) {
    const alpha = p.base * (0.65 + 0.35 * Math.sin(p.phase));
    const [r, g, b] = p.orange ? C_ORANGE : C_WARM;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4.5);
    glow.addColorStop(0,   `rgba(${r},${g},${b},${alpha})`);
    glow.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.35})`);
    glow.addColorStop(1,   `rgba(${r},${g},${b},0)`);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 4.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fill();
  }

  // ── Connections ──
  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = dx * dx + dy * dy;
        if (d < CONNECT_DIST * CONNECT_DIST) {
          const alpha = (1 - Math.sqrt(d) / CONNECT_DIST) * 0.10;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(249,115,22,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
  }

  // ── Hex grid ──
  function drawHexGrid(t) {
    const cols = Math.ceil(W / (HEX_SIZE * 1.732)) + 3;
    const rows = Math.ceil(H / (HEX_SIZE * 1.5))   + 3;
    ctx.lineWidth = 0.5;
    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const cx = col * HEX_SIZE * 1.732 + (row & 1) * HEX_SIZE * 0.866;
        const cy = row * HEX_SIZE * 1.5;
        // pulse individual hexagons slightly
        const pulse = 0.03 + 0.015 * Math.sin(t * 0.0008 + col * 0.4 + row * 0.7);
        ctx.strokeStyle = `rgba(249,115,22,${pulse})`;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const x = cx + (HEX_SIZE - 3) * Math.cos(a);
          const y = cy + (HEX_SIZE - 3) * Math.sin(a);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  // ── Scan line ──
  function drawScanLine() {
    scanY = (scanY + SCAN_SPEED) % H;
    const g = ctx.createLinearGradient(0, scanY - 60, 0, scanY + 60);
    g.addColorStop(0,   "rgba(249,115,22,0)");
    g.addColorStop(0.45,"rgba(249,115,22,0.055)");
    g.addColorStop(0.5, "rgba(249,115,22,0.12)");
    g.addColorStop(0.55,"rgba(249,115,22,0.055)");
    g.addColorStop(1,   "rgba(249,115,22,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, scanY - 60, W, 120);
  }

  // ── Central glow orbs ──
  function drawGlowOrbs(t) {
    const orbs = [
      { rx: 0.72, ry: 0.32, rad: W * 0.38, a: 0.12 + 0.04 * Math.sin(t * 0.0007) },
      { rx: 0.18, ry: 0.65, rad: W * 0.24, a: 0.06 + 0.02 * Math.sin(t * 0.0011 + 1) },
    ];
    for (const o of orbs) {
      const g = ctx.createRadialGradient(W * o.rx, H * o.ry, 0, W * o.rx, H * o.ry, o.rad);
      g.addColorStop(0, `rgba(249,115,22,${o.a})`);
      g.addColorStop(1, "rgba(249,115,22,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ── Food molecule rings (decorative) ──
  function drawMoleculeRings(t) {
    const rings = [
      { x: W * 0.78, y: H * 0.25, r: 60, phase: t * 0.0009 },
      { x: W * 0.12, y: H * 0.72, r: 38, phase: t * 0.0012 + 2 },
      { x: W * 0.55, y: H * 0.82, r: 26, phase: t * 0.0006 + 4 },
    ];
    for (const ring of rings) {
      const alpha = 0.06 + 0.03 * Math.sin(ring.phase * 2);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r + 6 * Math.sin(ring.phase), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(249,115,22,${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(244,242,237,${alpha * 0.5})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // nodes on ring
      for (let n = 0; n < 6; n++) {
        const a = (Math.PI / 3) * n + ring.phase;
        const nx = ring.x + ring.r * Math.cos(a);
        const ny = ring.y + ring.r * Math.sin(a);
        ctx.beginPath();
        ctx.arc(nx, ny, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(249,115,22,${alpha * 2.5})`;
        ctx.fill();
      }
    }
  }

  // ── Main loop ──
  function animate(t) {
    ctx.clearRect(0, 0, W, H);

    // background
    ctx.fillStyle = "#0c0d10";
    ctx.fillRect(0, 0, W, H);

    drawGlowOrbs(t);
    drawHexGrid(t);
    drawScanLine();
    drawMoleculeRings(t);
    drawConnections();
    particles.forEach(p => { updateParticle(p); drawParticle(p); });

    rafId = requestAnimationFrame(animate);
  }

  function start() {
    cancelAnimationFrame(rafId);
    resize();
    particles = Array.from({ length: PARTICLE_COUNT }, makeParticle);
    rafId = requestAnimationFrame(animate);
  }

  const ro = new ResizeObserver(() => { resize(); });
  ro.observe(canvas);

  start();
})();

// ── END HERO CANVAS ──────────────────────────────────────────────────────────

(function initMarketVisual() {
  const canvas = document.getElementById("market-visual-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let rafId = 0;
  let points = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    points = Array.from({ length: 42 }, (_, index) => ({
      x: ((index % 14) / 13) * width,
      y: (0.25 + Math.floor(index / 14) * 0.25) * height,
      offset: Math.random() * Math.PI * 2,
      speed: 0.0007 + Math.random() * 0.0008,
      radius: 2 + Math.random() * 3
    }));
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);

    const orange = "249,115,22";
    const cream = "244,242,237";
    const centerY = height * 0.55;

    ctx.lineWidth = 1.4;
    for (let lane = 0; lane < 4; lane++) {
      const yBase = centerY + (lane - 1.5) * 32;
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 16) {
        const wave = Math.sin(x * 0.018 + time * 0.0012 + lane) * (18 + lane * 5);
        const y = yBase + wave;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${lane % 2 ? cream : orange},${0.16 + lane * 0.035})`;
      ctx.stroke();
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const pulse = Math.sin(time * point.speed + point.offset);
      const x = point.x + Math.sin(time * 0.0006 + point.offset) * 16;
      const y = point.y + pulse * 24;

      for (let j = i + 1; j < points.length; j++) {
        const other = points[j];
        const ox = other.x + Math.sin(time * 0.0006 + other.offset) * 16;
        const oy = other.y + Math.sin(time * other.speed + other.offset) * 24;
        const dx = x - ox;
        const dy = y - oy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(ox, oy);
          ctx.strokeStyle = `rgba(${orange},${(1 - dist / 150) * 0.10})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      const glow = ctx.createRadialGradient(x, y, 0, x, y, point.radius * 8);
      glow.addColorStop(0, `rgba(${orange},0.42)`);
      glow.addColorStop(1, `rgba(${orange},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, point.radius * 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${cream},${0.48 + pulse * 0.16})`;
      ctx.beginPath();
      ctx.arc(x, y, point.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let bar = 0; bar < 18; bar++) {
      const x = (bar / 17) * width;
      const barHeight = 28 + Math.sin(time * 0.001 + bar * 0.7) * 20 + (bar % 5) * 8;
      ctx.fillStyle = `rgba(${orange},${0.10 + (bar % 4) * 0.025})`;
      ctx.fillRect(x, height - barHeight - 22, 8, barHeight);
    }

    if (!prefersReducedMotion) rafId = requestAnimationFrame(draw);
  }

  resize();
  new ResizeObserver(resize).observe(canvas);
  rafId = requestAnimationFrame(draw);

  window.addEventListener("beforeunload", () => cancelAnimationFrame(rafId));
})();

const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

if (navToggle && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    navToggle.classList.toggle("is-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("nav-open", isOpen);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      navToggle.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-open");
    });
  });
}

const sessionTabs = Array.from(document.querySelectorAll("[data-session-tab]"));

sessionTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const targetId = tab.dataset.sessionTab;
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;

    sessionTabs.forEach((item) => {
      item.classList.toggle("is-active", item === tab);
    });

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

const accordionTriggers = Array.from(document.querySelectorAll(".accordion-trigger"));

accordionTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => {
    const targetId = trigger.getAttribute("aria-controls");
    const target = targetId ? document.getElementById(targetId) : null;
    if (!target) return;

    const willOpen = trigger.getAttribute("aria-expanded") !== "true";
    accordionTriggers.forEach((item) => {
      const itemTarget = document.getElementById(item.getAttribute("aria-controls"));
      item.setAttribute("aria-expanded", "false");
      itemTarget?.classList.remove("is-open");
    });

    trigger.setAttribute("aria-expanded", String(willOpen));
    target.classList.toggle("is-open", willOpen);
  });
});

const galleryItems = Array.from(document.querySelectorAll(".gallery-item"));
const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxClose = document.querySelector("[data-lightbox-close]");
const lightboxPrev = document.querySelector("[data-lightbox-prev]");
const lightboxNext = document.querySelector("[data-lightbox-next]");
let activeImageIndex = 0;

function openLightbox(index) {
  if (!lightbox || !lightboxImage) return;
  activeImageIndex = index;
  const item = galleryItems[activeImageIndex];
  const image = item.querySelector("img");
  lightboxImage.src = item.dataset.src || image.src;
  lightboxImage.alt = image.alt;
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  if (!lightbox || !lightboxImage) return;
  lightbox.hidden = true;
  lightboxImage.src = "";
  document.body.style.overflow = "";
}

function moveLightbox(direction) {
  const nextIndex = (activeImageIndex + direction + galleryItems.length) % galleryItems.length;
  openLightbox(nextIndex);
}

galleryItems.forEach((item, index) => {
  item.addEventListener("click", () => openLightbox(index));
});

lightboxClose?.addEventListener("click", closeLightbox);
lightboxPrev?.addEventListener("click", () => moveLightbox(-1));
lightboxNext?.addEventListener("click", () => moveLightbox(1));

lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if (!lightbox || lightbox.hidden) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") moveLightbox(-1);
  if (event.key === "ArrowRight") moveLightbox(1);
});

const form = document.querySelector("[data-form]");

const webhookUrl = "https://reg.imperiaforum.ru/bitrix_hooks/add_deal/";

function setFieldState(input, message) {
  const row = input.closest(".form__row");
  const error = row?.querySelector(".form__error");
  const isValid = message === true;
  input.classList.toggle("is-invalid", !isValid);
  if (error) error.textContent = isValid ? "" : message;
  return isValid;
}

function validateField(input) {
  const value = input.value.trim();

  if (input.required && !value) {
    return setFieldState(input, "Заполните поле");
  }

  if (input.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return setFieldState(input, "Введите корректный email");
  }

  return setFieldState(input, true);
}

if (form) {
  const steps = Array.from(form.querySelectorAll("[data-form-step]"));
  const nextButton = form.querySelector("[data-form-next]");
  const backButton = form.querySelector("[data-form-back]");
  const submitButton = form.querySelector(".form__submit");
  const inputs = Array.from(form.querySelectorAll("input[type='text'], input[type='email'], input[type='tel']"));
  const checkbox = form.querySelector("input[name='checkbox']");
  const checkboxError = form.querySelector(".form__error--checkbox");
  const submitError = form.querySelector(".form__error--submit");
  const success = form.querySelector(".form__success");
  let currentStep = 1;

  function setStep(step) {
    currentStep = step;
    steps.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.formStep === String(step));
    });
    if (submitError) submitError.textContent = "";
  }

  function getStepInputs(step) {
    const stepNode = form.querySelector(`[data-form-step="${step}"]`);
    return Array.from(stepNode?.querySelectorAll("input[type='text'], input[type='email'], input[type='tel']") || []);
  }

  function validateStep(step) {
    return getStepInputs(step).every(validateField);
  }

  inputs.forEach((input) => {
    input.addEventListener("input", () => validateField(input));
    input.addEventListener("blur", () => validateField(input));
  });

  checkbox?.addEventListener("change", () => {
    if (checkboxError) checkboxError.textContent = checkbox.checked ? "" : "Подтвердите согласие";
  });

  nextButton?.addEventListener("click", () => {
    if (validateStep(1)) setStep(2);
  });

  backButton?.addEventListener("click", () => {
    setStep(1);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (currentStep === 1) {
      if (validateStep(1)) setStep(2);
      return;
    }

    const fieldsValid = inputs.every(validateField);
    const privacyValid = Boolean(checkbox?.checked);

    if (checkboxError) checkboxError.textContent = privacyValid ? "" : "Подтвердите согласие";
    if (!fieldsValid || !privacyValid) return;

    if (submitError) submitError.textContent = "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Отправляем...";
    }

    try {
      await fetch(webhookUrl, {
        method: "POST",
        body: new FormData(form),
        mode: "no-cors",
        credentials: "include"
      });

      form.reset();
      inputs.forEach((input) => input.classList.remove("is-invalid"));
      steps.forEach((step) => { step.hidden = true; });
      if (success) success.hidden = false;
    } catch (error) {
      if (submitError) {
        submitError.textContent = "Не удалось отправить заявку. Попробуйте ещё раз.";
      }
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Отправить заявку";
      }
    }
  });
}

const cookieBanner = document.querySelector("[data-cookie-banner]");
const cookieAccept = document.querySelector("[data-cookie-accept]");
const cookieStorageKey = "apm-food-cookie-accepted";

if (cookieBanner && localStorage.getItem(cookieStorageKey) !== "true") {
  cookieBanner.hidden = false;
}

cookieAccept?.addEventListener("click", () => {
  localStorage.setItem(cookieStorageKey, "true");
  if (cookieBanner) cookieBanner.hidden = true;
});
