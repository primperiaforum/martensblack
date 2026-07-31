const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");

const heroVideo = document.querySelector(".hero__video");

if (heroVideo) {
  let heroVideoInView = true;
  const heroSection = heroVideo.closest(".hero") || heroVideo;

  heroVideo.muted = true;
  heroVideo.defaultMuted = true;
  heroVideo.playsInline = true;
  heroVideo.setAttribute("muted", "");
  heroVideo.setAttribute("playsinline", "");
  heroVideo.setAttribute("webkit-playsinline", "");

  const tryPlayHeroVideo = () => {
    if (document.hidden || !heroVideoInView) return;
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

  if ("IntersectionObserver" in window) {
    const heroVideoObserver = new IntersectionObserver(([entry]) => {
      heroVideoInView = entry.isIntersecting;
      if (heroVideoInView) {
        tryPlayHeroVideo();
      } else {
        heroVideo.pause();
      }
    }, { threshold: 0.12 });

    heroVideoObserver.observe(heroSection);
  }

  window.addEventListener("pageshow", tryPlayHeroVideo);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      heroVideo.pause();
    } else {
      tryPlayHeroVideo();
    }
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

function trackGoal(name, params = {}) {
  try {
    if (typeof window.ym === "function") {
      window.ym(47924438, "reachGoal", name, params);
    }
  } catch (error) {
    // Analytics must never block the form or site UI.
  }
}

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
    if (validateStep(1)) {
      setStep(2);
      trackGoal("form_step_next", { step: 1 });
    } else {
      trackGoal("form_validation_error", { step: 1 });
    }
  });

  backButton?.addEventListener("click", () => {
    setStep(1);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (currentStep === 1) {
      if (validateStep(1)) {
        setStep(2);
        trackGoal("form_step_next", { step: 1 });
      } else {
        trackGoal("form_validation_error", { step: 1 });
      }
      return;
    }

    const fieldsValid = inputs.map(validateField).every(Boolean);
    const privacyValid = Boolean(checkbox?.checked);

    if (checkboxError) checkboxError.textContent = privacyValid ? "" : "Подтвердите согласие";
    if (!fieldsValid || !privacyValid) {
      trackGoal("form_validation_error", { step: 2 });
      return;
    }

    if (submitError) submitError.textContent = "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Отправляем...";
    }

    try {
      trackGoal("form_submit_start");

      if (!isEndpointConfigured(formEndpoint)) {
        throw new Error("proxy_not_configured");
      }

      const submitResult = await submitLead(formEndpoint);
      trackGoal(submitResult?.queued ? "form_submit_queued" : "form_submit_success");

      form.reset();
      inputs.forEach((input) => input.classList.remove("is-invalid"));
      form.classList.add("is-success");
      steps.forEach((step) => { step.hidden = true; });
      if (submitError) submitError.hidden = true;
      if (success) success.hidden = false;
    } catch (error) {
      trackGoal("form_submit_error", { reason: error?.message || "unknown" });
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
  trackGoal("cookie_accept");
  if (cookieBanner) cookieBanner.hidden = true;
});

