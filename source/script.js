// ── HERO CANVAS ANIMATION ─────────────────────────────────────────────────────
(function initHeroCanvas() {
  const canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  start();
})();

// ── END HERO CANVAS ──────────────────────────────────────────────────────────

(function initMarketVisual() {
  const canvas = document.getElementById("market-visual-canvas");
  if (!canvas) return;
  if (canvas.closest("[hidden]")) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
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
  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }
  rafId = requestAnimationFrame(draw);

  window.addEventListener("beforeunload", () => cancelAnimationFrame(rafId));
})();

const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

const heroVideo = document.querySelector(".hero__video");

if (heroVideo) {
  heroVideo.muted = true;
  heroVideo.defaultMuted = true;
  heroVideo.playsInline = true;
  heroVideo.setAttribute("muted", "");
  heroVideo.setAttribute("playsinline", "");
  heroVideo.setAttribute("webkit-playsinline", "");

  const tryPlayHeroVideo = () => {
    const playPromise = heroVideo.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {
        heroVideo.closest(".hero__media")?.classList.add("video-fallback");
      });
    }
  };

  if (heroVideo.readyState >= 2) {
    tryPlayHeroVideo();
  } else {
    heroVideo.addEventListener("canplay", tryPlayHeroVideo, { once: true });
  }

  window.addEventListener("pageshow", tryPlayHeroVideo);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryPlayHeroVideo();
  });
}

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

const form = document.querySelector("[data-form]");
const textLetterPattern = "A-Za-zА-Яа-яЁё";

function setFieldState(input, message) {
  const row = input.closest(".form__row");
  const error = row?.querySelector(".form__error");
  const isValid = message === true;
  input.classList.toggle("is-invalid", !isValid);
  input.setAttribute("aria-invalid", String(!isValid));
  if (error) error.textContent = isValid ? "" : message;
  return isValid;
}

function sanitizeField(input) {
  const rule = input.dataset.validate;
  const value = input.value;

  if (rule === "person") {
    input.value = value
      .replace(/[^A-Za-zА-Яа-яЁё\s'-]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/-{2,}/g, "-")
      .replace(/'{2,}/g, "'");
  }

  if (rule === "city") {
    input.value = value
      .replace(/[^A-Za-zА-Яа-яЁё\s.'-]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/-{2,}/g, "-")
      .replace(/\.{2,}/g, ".");
  }

  if (rule === "phone") {
    let sanitized = value.replace(/[^\d+()\-\s]/g, "");
    sanitized = sanitized.replace(/(?!^)\+/g, "");
    input.value = sanitized;
  }
}

function countLetters(value) {
  return (value.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
}

function validateField(input) {
  const value = input.value.trim();
  const rule = input.dataset.validate;

  if (input.required && !value) {
    return setFieldState(input, "Заполните поле");
  }

  if (input.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return setFieldState(input, "Введите корректный email");
  }

  if (!value) {
    return setFieldState(input, true);
  }

  const personPattern = new RegExp(`^[${textLetterPattern}]+(?:[\\s'-][${textLetterPattern}]+)*$`);
  const cityPattern = new RegExp(`^[${textLetterPattern}]+(?:[\\s.'-][${textLetterPattern}]+)*$`);
  const businessPattern = new RegExp(`^[${textLetterPattern}0-9\\s"'«».,:;()№&+\\/-]+$`);

  if (rule === "person" && !personPattern.test(value)) {
    return setFieldState(input, "Укажите только буквы, пробел или дефис");
  }

  if (rule === "city" && !cityPattern.test(value)) {
    return setFieldState(input, "Укажите город без цифр и лишних символов");
  }

  if (rule === "phone") {
    const digits = value.replace(/\D/g, "");
    if (!/^\+?[\d\s()-]+$/.test(value) || digits.length < 10 || digits.length > 15) {
      return setFieldState(input, "Введите корректный телефон");
    }
  }

  if (rule === "business-text") {
    const allowed = businessPattern.test(value);
    if (!allowed || countLetters(value) < 2) {
      return setFieldState(input, "Укажите корректные данные");
    }
  }

  return setFieldState(input, true);
}

if (form) {
  const formEndpoint = form.action;
  const steps = Array.from(form.querySelectorAll("[data-form-step]"));
  const nextButton = form.querySelector("[data-form-next]");
  const backButton = form.querySelector("[data-form-back]");
  const submitButton = form.querySelector(".form__submit");
  const inputs = Array.from(form.querySelectorAll("input[type='text']:not([data-honeypot]), input[type='email'], input[type='tel']"));
  const checkbox = form.querySelector("input[name='checkbox']");
  const checkboxError = form.querySelector(".form__error--checkbox");
  const submitError = form.querySelector(".form__error--submit");
  const success = form.querySelector(".form__success");
  const startedAtInput = form.querySelector("[data-form-started-at]");
  const trackingFields = Array.from(form.querySelectorAll("[data-tracking-field]"));
  let currentStep = 1;

  if (startedAtInput) startedAtInput.value = String(Date.now());

  function fillTrackingFields() {
    const params = new URLSearchParams(window.location.search);
    const trackingData = {
      page_url: window.location.href,
      source_origin: window.location.origin,
      source_path: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer || "",
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || "",
      utm_term: params.get("utm_term") || "",
      utm_id: params.get("utm_id") || "",
      gclid: params.get("gclid") || "",
      yclid: params.get("yclid") || "",
      fbclid: params.get("fbclid") || ""
    };

    trackingFields.forEach((input) => {
      const name = input.dataset.trackingField;
      input.value = trackingData[name] || "";
    });
  }

  fillTrackingFields();

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
    return getStepInputs(step).map(validateField).every(Boolean);
  }

  function isEndpointConfigured(endpoint) {
    return Boolean(endpoint && !endpoint.includes("your-subdomain") && !endpoint.includes("example."));
  }

  function getSubmitErrorMessage(errorCode) {
    const messages = {
      too_many_requests: "Слишком много заявок подряд. Попробуйте отправить форму немного позже.",
      too_fast: "Попробуйте отправить форму ещё раз через пару секунд.",
      validation_failed: "Проверьте заполнение формы и попробуйте ещё раз.",
      forbidden_origin: "Форма временно недоступна с этого адреса сайта.",
      proxy_not_configured: "Форма временно недоступна. Напишите организаторам на email.",
      crm_unavailable: "CRM временно не отвечает. Попробуйте ещё раз.",
      crm_rejected: "CRM не приняла заявку. Попробуйте ещё раз."
    };

    return messages[errorCode] || "Не удалось отправить заявку. Попробуйте ещё раз.";
  }

  function isNetworkError(error) {
    return error instanceof TypeError || error.message === "network_error";
  }

  function submitWithIframe(endpoint, formData) {
    return new Promise((resolve, reject) => {
      const frameName = `lead-proxy-frame-${Date.now()}`;
      const iframe = document.createElement("iframe");
      const fallbackForm = document.createElement("form");
      let submittedAt = 0;
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("network_error"));
      }, 18000);

      function cleanup() {
        window.clearTimeout(timeout);
        iframe.remove();
        fallbackForm.remove();
      }

      iframe.name = frameName;
      iframe.hidden = true;
      iframe.addEventListener("load", () => {
        if (!submittedAt || Date.now() - submittedAt < 300) return;
        cleanup();
        resolve({ ok: true });
      });
      iframe.addEventListener("error", () => {
        cleanup();
        reject(new Error("network_error"));
      }, { once: true });

      fallbackForm.method = "POST";
      fallbackForm.action = endpoint;
      fallbackForm.target = frameName;
      fallbackForm.hidden = true;

      formData.forEach((value, name) => {
        if (value instanceof File) return;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        fallbackForm.append(input);
      });

      document.body.append(iframe, fallbackForm);
      submittedAt = Date.now();
      fallbackForm.submit();
    });
  }

  function submitWithBeacon(endpoint, formData) {
    if (!navigator.sendBeacon) return false;

    try {
      return navigator.sendBeacon(endpoint, formData);
    } catch (error) {
      return false;
    }
  }

  async function submitLead(endpoint) {
    const formData = new FormData(form);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
        credentials: "omit"
      });

      let result = {};
      try {
        result = await response.json();
      } catch (error) {
        result = {};
      }

      if (!response.ok || result.ok !== true) {
        throw new Error(result.error || "request_failed");
      }

      return result;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      if (submitWithBeacon(endpoint, formData)) return { ok: true };
      return submitWithIframe(endpoint, formData);
    }
  }

  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      sanitizeField(input);
      validateField(input);
    });
    input.addEventListener("blur", () => {
      input.value = input.value.trim().replace(/\s{2,}/g, " ");
      validateField(input);
    });
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

    const fieldsValid = inputs.map(validateField).every(Boolean);
    const privacyValid = Boolean(checkbox?.checked);

    if (checkboxError) checkboxError.textContent = privacyValid ? "" : "Подтвердите согласие";
    if (!fieldsValid || !privacyValid) return;

    if (submitError) submitError.textContent = "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Отправляем...";
    }

    try {
      if (!isEndpointConfigured(formEndpoint)) {
        throw new Error("proxy_not_configured");
      }

      await submitLead(formEndpoint);

      form.reset();
      inputs.forEach((input) => input.classList.remove("is-invalid"));
      form.classList.add("is-success");
      steps.forEach((step) => { step.hidden = true; });
      if (submitError) submitError.hidden = true;
      if (success) success.hidden = false;
    } catch (error) {
      if (submitError) {
        submitError.textContent = getSubmitErrorMessage(error.message);
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

