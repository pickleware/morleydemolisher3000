// smArt
(function () {
    try {
      console.clear();
    } catch (e) {}
    console.log("[smArt] injected");
  
    try {
      if (document.getElementById("Launcher")) {
        return;
      }
    } catch (e) {}
  
    class AssessmentHelper {
      constructor() {
        window.__AssessmentHelperInstance = this;
        this.answerIsDragging = false;
        this.answerInitialX = 0;
        this.answerInitialY = 0;
        this.cachedArticle = null;
        this.isRunning = false;
        this.currentAbortController = null;
        this._stoppedByWrite = false;
        this.eyeState = "sleep";
        this.currentVideo = null;
  
        this.animeScriptUrl =
          "https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js";
        this.draggabillyScriptUrl =
          "https://unpkg.com/draggabilly@3/dist/draggabilly.pkgd.min.js";
  
        this.assetBase = 
          "https://cdn.jsdelivr.net/gh/ardaryusz/smArt@main/icons/";
  
        // settings keys & defaults
        this.settingsKeys = {
          mc_wait: "ah_mc_wait_ms",
          mc_random_pct: "ah_mc_random_pct",
          w_min: "ah_w_min",
          w_max: "ah_w_max",
          w_level: "ah_w_level",
          w_blacklist: "ah_w_blacklist",
          w_lowercase: "ah_w_lowercase",
          w_mood: "ah_w_mood",
          ai_groq_url: "ah_ai_groq_url",
          ai_groq_key: "ah_ai_groq_key",
          ai_groq_model: "ah_ai_groq_model",
          ai_key_visible: "ah_ai_groq_key_visible",
        };
        this.defaults = {
          mc_wait: 300,
          mc_random_pct: 0,
          w_min: "",
          w_max: "",
          w_level: "C1",
          w_blacklist: "",
          w_lowercase: false,
          w_mood: "",
        };
  
        // UI state for settings: 'closed' | 'menu' | 'mc' | 'writing' | 'ai'
        this.settingsState = "closed";
  
        // store original eye style so we can restore after settings
        this._eyeOriginal = null;
  
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => this.init());
        } else {
          this.init();
        }
      }
  
      // -------- utility: settings storage --------
      saveSetting(key, value) {
        try {
          localStorage.setItem(key, String(value));
        } catch (e) {}
      }
      loadSetting(key, fallback) {
        try {
          const v = localStorage.getItem(key);
          if (v == null) return fallback; // null / undefined
          const s = String(v).trim();
          if (!s) return fallback; // empty str
          if (s === "undefined" || s === "null") return fallback;
          return v;
        } catch (e) {
          return fallback;
        }
      }
  
      getMCWait() {
        return Number(
          localStorage.getItem(this.settingsKeys.mc_wait) || this.defaults.mc_wait
        );
      }
      getMCRandomPct() {
        return Number(
          localStorage.getItem(this.settingsKeys.mc_random_pct) ||
            this.defaults.mc_random_pct
        );
      }
      resetMCWait() {
        this.saveSetting(this.settingsKeys.mc_wait, this.defaults.mc_wait);
      }
      resetMCRandom() {
        this.saveSetting(
          this.settingsKeys.mc_random_pct,
          this.defaults.mc_random_pct
        );
      }
  
      getWMin() {
        const v = localStorage.getItem(this.settingsKeys.w_min);
        return v === null ? "" : v;
      }
      getWMax() {
        const v = localStorage.getItem(this.settingsKeys.w_max);
        return v === null ? "" : v;
      }
      getWLevel() {
        return (
          localStorage.getItem(this.settingsKeys.w_level) || this.defaults.w_level
        );
      }
      getWBlacklist() {
        return (
          localStorage.getItem(this.settingsKeys.w_blacklist) ||
          this.defaults.w_blacklist
        );
      }
      getWLowercase() {
        return localStorage.getItem(this.settingsKeys.w_lowercase) === "true";
      }
      getWMood() {
        return (
          localStorage.getItem(this.settingsKeys.w_mood) || this.defaults.w_mood
        );
      }
      resetWToDefaults() {
        this.saveSetting(this.settingsKeys.w_min, "");
        this.saveSetting(this.settingsKeys.w_max, "");
        this.saveSetting(this.settingsKeys.w_level, this.defaults.w_level);
        this.saveSetting(this.settingsKeys.w_blacklist, "");
        this.saveSetting(
          this.settingsKeys.w_lowercase,
          this.defaults.w_lowercase ? "true" : "false"
        );
        this.saveSetting(this.settingsKeys.w_mood, "");
      }
  
      // -------- resources & element helpers --------
      getUrl(path) {
        if (!path) return "";
        if (/^https?:\/\//i.test(path)) return path;
        if (path.indexOf("icons/") === 0)
          return this.assetBase + path.substring("icons/".length);
        return this.assetBase + path;
      }
  
      createEl(tag, props = {}) {
        const el = document.createElement(tag);
        Object.keys(props).forEach((k) => {
          if (k === "style") el.style.cssText = props.style;
          else if (k === "dataset") Object.assign(el.dataset, props.dataset);
          else if (k === "children")
            props.children.forEach((c) => el.appendChild(c));
          else if (k === "text") el.textContent = props.text;
          else if (k === "innerHTML") el.innerHTML = props.innerHTML;
          else el[k] = props[k];
        });
        return el;
      }
  
      applyStylesOnce(id, cssText) {
        if (!document.getElementById(id)) {
          const style = document.createElement("style");
          style.id = id;
          style.textContent = cssText;
          document.head.appendChild(style);
        }
      }
  
      loadScript(url) {
        return new Promise((resolve, reject) => {
          const existing = Array.from(
            document.getElementsByTagName("script")
          ).find((s) => s.src && s.src.indexOf(url) !== -1);
          if (existing) return resolve();
          const script = document.createElement("script");
          script.src = url;
          script.onload = () => resolve();
          script.onerror = () => {
            script.remove();
            reject(new Error("Failed to load " + url));
          };
          document.head.appendChild(script);
        });
      }
  
      // -------- init / UI creation --------
      async init() {
        try {
          await Promise.resolve(this.loadScript(this.animeScriptUrl)).catch(
            () => {}
          );
          await Promise.resolve(this.loadScript(this.draggabillyScriptUrl)).catch(
            () => {}
          );
  
          this.itemMetadata = {
            UI: this.createUI(),
            answerUI: this.createAnswerUI(),
          };
          this.playIntroAnimation();
        } catch (err) {
          try {
            this.itemMetadata = {
              UI: this.createUI(),
              answerUI: this.createAnswerUI(),
            };
            this.showUI(true);
          } catch (e) {}
        }
      }
  
      createUI() {
        const container = this.createEl("div");
  
        const launcher = this.createEl("div", {
          id: "Launcher",
          className: "Launcher",
          style:
            "min-height:160px;opacity:0;visibility:hidden;transition:opacity 0.25s ease,width 0.25s ease,height 0.25s ease,font-size .12s ease;font-family:'Nunito',sans-serif;width:180px;height:240px;background:#010203;position:fixed;border-radius:12px;border:2px solid #0a0b0f;display:flex;flex-direction:column;align-items:center;color:white;font-size:16px;top:50%;left:20px;transform:translateY(-50%);z-index:99999;padding:16px;box-shadow:0 10px 8px rgba(0,0,0,0.2), 0 0 8px rgba(255,255,255,0.05);overflow:hidden;white-space:nowrap;",
        });
  
        const dragHandle = this.createEl("div", {
          className: "drag-handle",
          style:
            "width:100%;height:24px;cursor:move;background:transparent;position:absolute;top:0;",
        });
  
        const eyeWrapper = this.createEl("div", {
          id: "helperEye",
          style:
            "width:90px;height:90px;margin-top:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;transform-style:preserve-3d;transition:all 0.12s linear;will-change:transform,top,right,width,height;transform-origin:50% 40%;pointer-events:none;",
        });
  
        const uiImg = this.createEl("img", {
          id: "helperEyeImg",
          src: this.getUrl("icons/sleep.gif"),
          dataset: {
            idle: this.getUrl("icons/idle.gif"),
            tilt: this.getUrl("icons/full.gif"),
          },
          style:
            "width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;",
        });
  
        const uiVideo = this.createEl("video", {
          id: "helperEyeVideo",
          style:
            "width:100%;height:100%;object-fit:cover;display:none;pointer-events:none;",
          autoplay: false,
          loop: false,
          muted: true,
          playsInline: true,
          preload: "auto",
        });
  
        eyeWrapper.appendChild(uiImg);
        eyeWrapper.appendChild(uiVideo);
  
        const closeButton = this.createEl("button", {
          id: "closeButton",
          text: "\u00D7",
          style:
            "position:absolute;top:8px;right:8px;background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:2px 8px;transition:color 0.12s ease, transform 0.1s ease;opacity:0.5;z-index:100005;",
        });
  
        // main action button: style like settings buttons (colors) with hover later if im not lazy
        const getAnswerButton = this.createEl("button", {
          id: "getAnswerButton",
          style:
            "background:#151515;border:1px solid rgba(255,255,255,0.04);color:white;padding:10px 12px;border-radius:8px;cursor:pointer;margin-top:18px;width:140px;height:64px;font-size:14px;transition:background 0.14s ease, transform 0.08s ease, box-shadow 0.12s;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;",
        });
  
        const spinner = this.createEl("div", {
          id: "ah-spinner",
          style:
            "width:22px;height:22px;border-radius:50%;border:3px solid rgba(255,255,255,0.12);border-top-color:#ffffff;display:none;animation:ah-spin 0.85s cubic-bezier(.4,.0,.2,1) infinite;",
        });
  
        const buttonTextSpan = this.createEl("span", {
          text: "work smArt-er",
          id: "getAnswerButtonText",
          style: "font-size:14px;line-height:1;user-select:none;",
        });
  
        getAnswerButton.appendChild(spinner);
        getAnswerButton.appendChild(buttonTextSpan);
  
        // version
        const version = this.createEl("div", {
          id: "ah-version",
          style:
            "position:absolute;bottom:8px;right:8px;font-size:12px;opacity:0.9;z-index:100005",
          text: "2.1",
        });
  
        // settings cog
        const settingsCog = this.createEl("button", {
          id: "settingsCog",
          title: "Settings",
          innerHTML: "⚙",
          style:
            "position:absolute;bottom:8px;left:8px;background:none;border:none;color:#cfcfcf;font-size:16px;cursor:pointer;opacity:0.85;padding:2px;transition:transform .12s;z-index:100005",
        });
  
        // exit out of settings, red arrow
        const settingsBack = this.createEl("button", {
          id: "settingsBack",
          title: "Back",
          innerHTML: "⟵",
          style:
            "position:absolute;bottom:8px;left:8px;background:none;border:none;color:#ff4d4d;font-size:18px;cursor:pointer;opacity:0;display:none;padding:2px;transition:opacity .12s;z-index:100005",
        });
  
        // settings container
        const settingsPanel = this.createEl("div", {
          id: "settingsPanel",
          style:
            "position:absolute;top:48px;left:12px;right:12px;bottom:48px;display:flex;flex-direction:column;align-items:flex-start;gap:8px;overflow:auto;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s ease, visibility 0s linear .18s;",
        });
  
        launcher.appendChild(dragHandle);
        launcher.appendChild(eyeWrapper);
        launcher.appendChild(closeButton);
        launcher.appendChild(getAnswerButton);
        launcher.appendChild(version);
        launcher.appendChild(settingsCog);
        launcher.appendChild(settingsBack);
        launcher.appendChild(settingsPanel);
  
        container.appendChild(launcher);
  
        // spinner keyframes and minor styles + hover rules for buttons and settings
        this.applyStylesOnce(
          "assessment-helper-spinner-styles",
          `
                  @keyframes ah-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                  #getAnswerButton.running { background: #1e1e1e; box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
                  #getAnswerButton.running span { font-size:12px; opacity:0.95; }
                  #settingsPanel input[type="number"] { width:80px; padding:4px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:white; }
                  #settingsPanel label { font-size:13px; margin-right:6px; }
                  .ah-reset { cursor:pointer; margin-left:8px; opacity:0.8; font-size:14px; user-select:none; }
                  .ah-section-title { font-weight:700; margin-top:4px; margin-bottom:6px; font-size:14px; }
                  #settingsPanel button { transition: background 0.12s ease, transform 0.08s ease; }
                  #settingsPanel button:hover { background:#222; transform: translateY(-1px); }
                  #getAnswerButton:hover { background: #1f1f1f !important; transform: translateY(-1px); }
                  #settingsCog { transition: transform 0.12s ease, opacity 0.12s ease; }
                  #settingsCog:hover { transform: rotate(22.5deg); }
              `
        );
  
        return container;
      }
  
      createAnswerUI() {
        const container = this.createEl("div");
        const answerContainer = this.createEl("div", {
          id: "answerContainer",
          className: "answerLauncher",
          style:
            "outline:none;min-height:60px;transform:translateX(0px) translateY(-50%);opacity:0;visibility:hidden;transition:opacity 0.3s ease, transform 0.3s ease;font-family:'Nunito',sans-serif;width:60px;height:60px;background:#1c1e2b;position:fixed;border-radius:8px;display:flex;justify-content:center;align-items:center;color:white;font-size:24px;top:50%;right:220px;z-index:99998;padding:8px;box-shadow:0 4px 8px rgba(0,0,0,0.2);overflow:hidden;white-space:normal;",
        });
  
        const dragHandle = this.createEl("div", {
          className: "answer-drag-handle",
          style:
            "width:100%;height:24px;cursor:move;background:transparent;position:absolute;top:0;",
        });
        const closeButton = this.createEl("button", {
          id: "closeAnswerButton",
          style:
            "position:absolute;top:8px;right:8px;background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:2px 8px;transition:color 0.2s ease, transform 0.1s ease;",
        });
        const answerContent = this.createEl("div", {
          id: "answerContent",
          style:
            "padding:0;margin:0;word-wrap:break-word;font-size:24px;font-weight:bold;display:flex;justify-content:center;align-items:center;width:100%;height:100%;",
        });
  
        answerContainer.appendChild(dragHandle);
        answerContainer.appendChild(closeButton);
        answerContainer.appendChild(answerContent);
        container.appendChild(answerContainer);
        return container;
      }
  
      // -------- intro & show UI --------
      playIntroAnimation() {
        if (typeof anime === "undefined") {
          this.showUI();
          return;
        }
        const imageUrl = this.getUrl("icons/eyebackground.gif");
        const introImgElement = this.createEl("img", {
          src: imageUrl,
          id: "introLoaderImage",
          style:
            "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.5);width:100px;height:auto;border-radius:12px;box-shadow:0 4px 8px rgba(0,0,0,0.2);z-index:100001;opacity:0;",
        });
        document.body.appendChild(introImgElement);
  
        anime
          .timeline({
            easing: "easeInOutQuad",
            duration: 800,
            complete: () => {
              try {
                introImgElement.remove();
              } catch (e) {}
              this.showUI();
            },
          })
          .add({
            targets: introImgElement,
            opacity: [0, 1],
            scale: [0.5, 1],
            rotate: "1turn",
            duration: 1000,
            easing: "easeOutExpo",
          })
          .add({
            targets: introImgElement,
            translateY: "-=20",
            duration: 500,
            easing: "easeInOutSine",
          })
          .add({
            targets: introImgElement,
            translateY: "+=20",
            duration: 500,
            easing: "easeInOutSine",
          })
          .add(
            {
              targets: introImgElement,
              opacity: 0,
              duration: 500,
              easing: "linear",
            },
            "+=500"
          );
      }
  
      showUI(skipAnimation = false) {
        try {
          document.body.appendChild(this.itemMetadata.UI);
          document.body.appendChild(this.itemMetadata.answerUI);
        } catch (e) {}
        const launcher = document.getElementById("Launcher");
        if (!launcher) {
          this.setupEventListeners();
          return;
        }
        if (skipAnimation) {
          launcher.style.visibility = "visible";
          launcher.style.opacity = 1;
          this.setupEventListeners();
        } else {
          launcher.style.visibility = "visible";
          setTimeout(() => (launcher.style.opacity = 1), 10);
          setTimeout(() => this.setupEventListeners(), 200);
        }
      }
  
      showAlert(message, type = "info", ms = 4000) {
        try {
          const existing = document.getElementById("ah-alert");
          if (existing) existing.remove();
        } catch (e) {}
  
        const alertContainer = this.createEl("div", {
          id: "ah-alert",
          style: `position:fixed;top:20px;left:50%;transform:translateX(-50%);
                  background-color:${type === "error" ? "#dc3545" : "#007bff"};
                  color:white;padding:12px 18px;border-radius:8px;
                  box-shadow:0 4px 12px rgba(0,0,0,0.2);
                  z-index:100000;opacity:0;transition:opacity 0.25s ease-in-out;
                  font-family:'Nunito',sans-serif;font-size:14px;max-width:80%;text-align:center;`,
        });
  
        alertContainer.textContent = String(message || "");
        document.body.appendChild(alertContainer);
  
        setTimeout(() => (alertContainer.style.opacity = "1"), 10);
        setTimeout(() => {
          alertContainer.style.opacity = "0";
          alertContainer.addEventListener(
            "transitionend",
            () => alertContainer.remove(),
            { once: true }
          );
        }, Math.max(800, Number(ms) || 4000));
      }
      
      getChoices() {
        const answerNodes = Array.from(document.querySelectorAll(`
          .student-quiz-page__answer.answer-card-wrapper[role="radio"],
          .student-quiz-pageanswer.answer-card-wrapper[role="radio"],
          .student-quiz-pageanswers [role="radio"],
          .student-quiz-page__answers [role="radio"]
        `));
      
        return answerNodes.map((el, i) => {
          const letter =
            el.querySelector(".answer-card__alpha")?.innerText?.trim() ||
            el.querySelector(".answer-cardalpha")?.innerText?.trim() ||
            String.fromCharCode(65 + i);
      
          const text =
            el.querySelector(".answer-card__body")?.innerText?.trim() ||
            el.querySelector(".answer-cardbody")?.innerText?.trim() ||
            el.innerText?.trim() ||
            "";
      
          return { letter, text, el };
        }).filter(c => c.letter && c.text);
      }

      // -------- fetch article / answer --------
      async fetchArticleContent() {
        try {
          let article = "";
          let question = "";
          let title = "";
      
          // 1) Title – already working in your logs
          const titleEl =
            document.querySelector(".quiz-header-title") ||
            document.querySelector("[class*='quiz-header-title']");
          if (titleEl) {
            title = titleEl.innerText.trim();
          }
      
          // 2) Passage – this is already working for you
          const articleEl =
            document.querySelector(".student-quiz-pagedescription .description-wrapper") ||
            document.querySelector(".description-wrapper") ||
            document.querySelector("[class*='description-wrapper']");
          if (articleEl) {
            article = Array.from(articleEl.querySelectorAll("p"))
              .map(p => p.textContent.trim())
              .filter(Boolean)
              .join("\n\n");
          }
      
          // 3) Question – broaden the selector set
          let questionEl =
            document.querySelector(".student-quiz-pagequestion") ||             // legacy
            document.querySelector(".student-quiz-page__question") ||           // newer BEM
            document.querySelector("[class*='student-quiz-pagequestion']") ||   // partial
            document.querySelector("[class*='student-quiz-page__question']");
      
          if (questionEl) {
            // Some variants wrap the text inside <p> inside the question container
            const p = questionEl.querySelector("p");
            question = (p ? p.innerText : questionEl.innerText).trim();
          }
      
          console.log("rtbridgepagedata questions:", window.rtbridgepagedata?.questions || []);
          console.log("title:", title);
          console.log("article:", article);
          console.log("question:", question);
      
          const combinedContent = [title, article, question]
            .filter(Boolean)
            .join("\n\n")
            .trim();
      
          this.cachedArticle = combinedContent;
          return combinedContent;
        } catch (err) {
          console.error("fetchArticleContent failed:", err);
          return "";
        }
      }
  
      async fetchAnswer(queryContent, retryCount = 0) {
        const MAX_RETRIES = 3,
          RETRY_DELAY_MS = 1000;
  
        try {
          // abort any pending request
          if (this.currentAbortController) {
            try {
              this.currentAbortController.abort();
            } catch (e) {}
          }
          this.currentAbortController = new AbortController();
          const signal = this.currentAbortController.signal;
  
          const groqUrl = this.loadSetting(
            this.settingsKeys.ai_groq_url,
            "https://openrouter.ai/api/v1/chat/completions"
          );
          const groqModel = this.loadSetting(
            this.settingsKeys.ai_groq_model,
            "inclusionai/ling-2.6-flash:free"
          );
          const groqKey = this.loadSetting(this.settingsKeys.ai_groq_key, "");
  
          if (!groqKey) {
            this.currentAbortController = null;
            return "Error: API key missing. Open Settings → AI Settings and paste your key.";
          }
  
          const payload = {
            model: groqModel,
            messages: [
              {
                role: "user",
                content:
                  (queryContent || "") +
                  (this.cachedArticle
                    ? `\n\nArticle:\n${this.cachedArticle}`
                    : ""),
              },
            ],
            max_tokens: 1024,
          };
  
          const response = await fetch(groqUrl, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: "Bearer " + groqKey,
            },
            body: JSON.stringify(payload),
            signal,
          });
  
          this.currentAbortController = null;
  
          if (!response.ok) {
            const text = await response.text().catch(() => "");
            const status = response.status;
            const isQuotaOrRate =
              /quota|exceeded|rate limit|429/i.test(text) ||
              status === 429 ||
              status === 500;
  
            if (isQuotaOrRate && retryCount < MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
              return this.fetchAnswer(queryContent, retryCount + 1);
            }
            return `Error: API error ${status}: ${text}`;
          }
  
          const data = await response.json().catch(() => null);
  
          if (data && Array.isArray(data.choices) && data.choices.length) {
            const c = data.choices[0];
            if (c.message && typeof c.message.content === "string")
              return c.message.content.trim();
            if (typeof c.text === "string") return c.text.trim();
          }
  
          if (data && typeof data.output === "string") return data.output.trim();
          if (data && (data.response || data.answer))
            return String(data.response || data.answer).trim();
          if (data && data.result) return String(data.result).trim();
  
          return "No answer available";
        } catch (err) {
          if (err && err.name === "AbortError") return "<<ABORTED>>";
          return `Error: ${err && err.message ? err.message : String(err)}`;
        }
      }
  
      // -------- eye helpers --------
      setEyeToSleep() {
        if (this.eyeState === "full") return;
        try {
          this.clearCurrentVideo();
          const img = document.getElementById("helperEyeImg");
          const video = document.getElementById("helperEyeVideo");
          if (!img || !video) return;
          video.style.display = "none";
          img.style.display = "block";
          img.src = this.getUrl("icons/sleep.gif");
          this.eyeState = "sleep";
          img.style.opacity = "1";
        } catch (err) {}
      }
  
      setEyeToFull() {
        try {
          this.eyeState = "full";
          this.clearCurrentVideo();
          const img = document.getElementById("helperEyeImg");
          const video = document.getElementById("helperEyeVideo");
          if (!img || !video) return;
          video.style.display = "none";
          img.style.display = "block";
          img.src = this.getUrl("icons/full.gif") + "?r=" + Date.now();
        } catch (err) {}
      }
  
      async handleHoverEnter() {
        if (this.eyeState === "full") return;
        try {
          await this.playVideoOnce(this.getUrl("icons/wakeup.webm"));
          if (this.eyeState === "full") return;
          const img = document.getElementById("helperEyeImg");
          const video = document.getElementById("helperEyeVideo");
          if (!img || !video) return;
          video.style.display = "none";
          img.style.display = "block";
          img.src = this.getUrl("icons/idle.gif") + "?r=" + Date.now();
          this.eyeState = "idle";
        } catch (err) {}
      }
  
      async handleHoverLeave() {
        if (this.eyeState === "full") return;
        try {
          await this.playVideoOnce(this.getUrl("icons/gotosleep.webm"));
          if (this.eyeState === "full") return;
          this.setEyeToSleep();
        } catch (err) {}
      }
  
      playVideoOnce(src) {
        return new Promise((resolve) => {
          try {
            const video = document.getElementById("helperEyeVideo");
            const img = document.getElementById("helperEyeImg");
            if (!video || !img) {
              resolve();
              return;
            }
            this.clearCurrentVideo();
            video.src = src;
            video.loop = false;
            video.muted = true;
            video.playsInline = true;
            video.preload = "auto";
            video.style.display = "block";
            img.style.display = "none";
            this.currentVideo = video;
  
            if (src.indexOf("wakeup") !== -1) this.eyeState = "waking";
            else if (src.indexOf("gotosleep") !== -1)
              this.eyeState = "going-to-sleep";
            else this.eyeState = "waking";
  
            const onEnded = () => {
              if (this.currentVideo === video) this.currentVideo = null;
              video.removeEventListener("ended", onEnded);
              video.removeEventListener("error", onError);
              setTimeout(() => resolve(), 8);
            };
            const onError = () => {
              if (this.currentVideo === video) this.currentVideo = null;
              video.removeEventListener("error", onError);
              video.removeEventListener("ended", onEnded);
              resolve();
            };
  
            video.addEventListener("ended", onEnded);
            video.addEventListener("error", onError);
  
            const playPromise = video.play();
            if (playPromise && typeof playPromise.then === "function") {
              playPromise.catch(() => {
                video.removeEventListener("ended", onEnded);
                video.removeEventListener("error", onError);
                this.currentVideo = null;
                setTimeout(() => resolve(), 250);
              });
            }
          } catch (err) {
            resolve();
          }
        });
      }
  
      clearCurrentVideo() {
        try {
          const video = document.getElementById("helperEyeVideo");
          const img = document.getElementById("helperEyeImg");
          if (!video || !img) return;
          try {
            if (!video.paused) video.pause();
          } catch (e) {}
          try {
            video.removeAttribute("src");
            video.load();
          } catch (e) {}
          video.style.display = "none";
          img.style.display = "block";
          this.currentVideo = null;
        } catch (err) {}
      }
  
      // -------- UI start/stop --------
      async startProcessUI() {
        const btn = document.getElementById("getAnswerButton");
        const spinner = document.getElementById("ah-spinner");
        const label = document.getElementById("getAnswerButtonText");
        if (btn) btn.classList.add("running");
        if (spinner) spinner.style.display = "block";
        if (label) label.textContent = "stop.";
        try {
          console.log("[AssessmentHelper] started");
        } catch (e) {}
      }
  
      async stopProcessUI() {
        const btn = document.getElementById("getAnswerButton");
        const spinner = document.getElementById("ah-spinner");
        const label = document.getElementById("getAnswerButtonText");
        if (btn) btn.classList.remove("running");
        if (spinner) spinner.style.display = "none";
        if (label) label.textContent = "work smArt-er";
        try {
          console.log("[AssessmentHelper] stopped");
        } catch (e) {}
  
        try {
          await this.playVideoOnce(this.getUrl("icons/gotosleep.webm"));
        } catch (e) {}
        this.setEyeToSleep();
      }
  
      stopProcessImmediate() {
        this.isRunning = false;
        if (this.currentAbortController) {
          try {
            this.currentAbortController.abort();
          } catch (e) {}
          this.currentAbortController = null;
        }
      }
  
      // -------- settings UI, flows with directional expansion and eye shrink --------
      _computeExpandRight() {
        const launcher = document.getElementById("Launcher");
        if (!launcher) return true;
        const rect = launcher.getBoundingClientRect();
        const distanceToLeft = rect.left;
        const distanceToRight = window.innerWidth - rect.right;
        // if closer to left edge, expand right, otherwise expand left
        return distanceToLeft <= distanceToRight;
      }
  
      _setLauncherWidthAndAnchor(widthPx, expandRight) {
        const launcher = document.getElementById("Launcher");
        if (!launcher) return;
        const rect = launcher.getBoundingClientRect();
        if (expandRight) {
          // fix left and expand to the right
          launcher.style.left = `${rect.left}px`;
          launcher.style.right = "auto";
          launcher.style.width = `${widthPx}px`;
        } else {
          // fix right and expand to the left
          const rightCss = Math.round(window.innerWidth - rect.right);
          launcher.style.right = `${rightCss}px`;
          launcher.style.left = "auto";
          launcher.style.width = `${widthPx}px`;
        }
      }
  
      _shrinkEyeToTopRight() {
        const eye = document.getElementById("helperEye");
        if (!eye) return;
        // save original once
        if (!this._eyeOriginal) {
          this._eyeOriginal = { style: eye.getAttribute("style") || "" };
        }
  
        // shrink and move under the X, inside the launcher
        eye.style.display = "flex";
        eye.style.position = "absolute";
        eye.style.top = "12px";
        eye.style.right = "44px";
        eye.style.width = "48px";
        eye.style.height = "48px";
        eye.style.marginTop = "0";
        eye.style.zIndex = "100004";
        // also shrink internal img
        const img = document.getElementById("helperEyeImg");
        if (img) img.style.width = "100%";
      }
  
      _restoreEyeFromShrink() {
        const eye = document.getElementById("helperEye");
        if (!eye) return;
        if (this._eyeOriginal) {
          // restore style string
          eye.setAttribute("style", this._eyeOriginal.style);
          this._eyeOriginal = null;
        } else {
          // fallback restore approximate layout
          eye.style.position = "";
          eye.style.top = "";
          eye.style.right = "";
          eye.style.width = "90px";
          eye.style.height = "90px";
          eye.style.marginTop = "32px";
          eye.style.zIndex = "";
          const img = document.getElementById("helperEyeImg");
          if (img) img.style.width = "100%";
        }
      }
  
      buildSettingsMenu() {
        const panel = document.getElementById("settingsPanel");
        if (!panel) return;
        panel.innerHTML = "";
  
        const title = this.createEl("div", {
          className: "ah-section-title",
          text: "Settings",
        });
        panel.appendChild(title);
  
        const mcBtn = this.createEl("button", {
          id: "mcSettingsBtn",
          text: "Multiple Choice Settings",
          style:
            "padding:10px 12px;border-radius:8px;background:#151515;border:1px solid rgba(255,255,255,0.04);color:white;cursor:pointer;",
        });
  
        const wrBtn = this.createEl("button", {
          id: "writingSettingsBtn",
          text: "Writing Settings",
          style:
            "padding:10px 12px;border-radius:8px;background:#151515;border:1px solid rgba(255,255,255,0.04);color:white;cursor:pointer;",
        });
  
        const aiBtn = this.createEl("button", {
          id: "aiSettingsBtn",
          text: "AI Settings",
          style:
            "padding:10px 12px;border-radius:8px;background:#151515;border:1px solid rgba(255,255,255,0.04);color:white;cursor:pointer;",
        });
  
        panel.appendChild(mcBtn);
        panel.appendChild(wrBtn);
        panel.appendChild(aiBtn);
  
        mcBtn.addEventListener("click", (e) => {
          e.preventDefault();
          this.openMCSettings();
        });
        wrBtn.addEventListener("click", (e) => {
          e.preventDefault();
          this.openWritingSettings();
        });
        aiBtn.addEventListener("click", (e) => {
          e.preventDefault();
          this.openAISettings();
        });
      }
  
      openSettingsMenu() {
        const launcher = document.getElementById("Launcher");
        if (!launcher) return;
        const eye = document.getElementById("helperEye");
        const btn = document.getElementById("getAnswerButton");
  
        // compute direction and set width to menu-size
        const expandRight = this._computeExpandRight();
        this._setLauncherWidthAndAnchor(360, expandRight);
  
        // shrink eye but keep visible at top-right
        this._shrinkEyeToTopRight();
  
        // fade out main items except version & close & cog/back
        if (btn) {
          btn.style.transition = "opacity 0.12s";
          btn.style.opacity = "0";
          setTimeout(() => (btn.style.display = "none"), 140);
        }
  
        const panel = document.getElementById("settingsPanel");
        if (panel) {
          panel.style.visibility = "visible";
          panel.style.pointerEvents = "auto";
          panel.style.transitionDelay = "0s";
          panel.style.opacity = "1";
        }
  
        // replace cog with back arrow
        const settingsCog = document.getElementById("settingsCog");
        const settingsBack = document.getElementById("settingsBack");
        if (settingsCog) settingsCog.style.display = "none";
        if (settingsBack) {
          settingsBack.style.display = "block";
          settingsBack.style.opacity = "1";
        }
  
        this.settingsState = "menu";
        this.buildSettingsMenu();
        launcher.style.height = "340px";
      }
  
      openMCSettings() {
        const panel = document.getElementById("settingsPanel");
        const expandRight = this._computeExpandRight();
        this._setLauncherWidthAndAnchor(520, expandRight);
        if (!panel) return;
        panel.innerHTML = "";
        this.settingsState = "mc";
  
        const title = this.createEl("div", {
          className: "ah-section-title",
          text: "Multiple Choice Settings",
        });
        panel.appendChild(title);
  
        const waitRow = this.createEl("div", {
          style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;",
        });
        const waitLabel = this.createEl("label", {
          text: "Wait time (ms):",
          style: "min-width:120px;",
        });
        const waitInput = this.createEl("input", {
          type: "number",
          id: "mcWaitInput",
          value: String(this.getMCWait()),
          style: "",
        });
        const waitReset = this.createEl("span", {
          className: "ah-reset",
          text: "↺",
          title: "Reset to default",
        });
        waitReset.addEventListener("click", () => {
          this.resetMCWait();
          waitInput.value = String(this.getMCWait());
        });
        waitInput.addEventListener("change", () => {
          const v = Number(waitInput.value) || this.defaults.mc_wait;
          this.saveSetting(this.settingsKeys.mc_wait, v);
        });
  
        waitRow.appendChild(waitLabel);
        waitRow.appendChild(waitInput);
        waitRow.appendChild(waitReset);
        panel.appendChild(waitRow);
  
        const probRow = this.createEl("div", {
          style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;",
        });
        const probLabel = this.createEl("label", {
          text: "Random answer %:",
          style: "min-width:120px;",
        });
        const probInput = this.createEl("input", {
          type: "number",
          id: "mcRandomInput",
          value: String(this.getMCRandomPct()),
          min: 0,
          max: 100,
        });
        const probReset = this.createEl("span", {
          className: "ah-reset",
          text: "↺",
          title: "Reset to default",
        });
        probReset.addEventListener("click", () => {
          this.resetMCRandom();
          probInput.value = String(this.getMCRandomPct());
        });
        probInput.addEventListener("change", () => {
          let v = Number(probInput.value);
          if (!Number.isFinite(v) || v < 0) v = 0;
          if (v > 100) v = 100;
          this.saveSetting(this.settingsKeys.mc_random_pct, v);
          probInput.value = String(v);
        });
  
        probRow.appendChild(probLabel);
        probRow.appendChild(probInput);
        probRow.appendChild(probReset);
        panel.appendChild(probRow);
  
        const note = this.createEl("div", {
          text: "Tip: set random % to >0 if you want occasional wrong answers to mimic real users.",
          style: "font-size:12px;opacity:0.8;margin-top:8px;",
        });
        panel.appendChild(note);
      }
  
      openWritingSettings() {
        const panel = document.getElementById("settingsPanel");
        const expandRight = this._computeExpandRight();
        this._setLauncherWidthAndAnchor(520, expandRight);
        this.settingsState = "writing";
        if (!panel) return;
        panel.innerHTML = "";
  
        const title = this.createEl("div", {
          className: "ah-section-title",
          text: "Writing Settings",
        });
        panel.appendChild(title);
  
        const minRow = this.createEl("div", {
          style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;",
        });
  
        const minLabel = this.createEl("label", {
          text: "Minimum words (optional):",
          style: "min-width:160px;",
        });
        
        const minInput = this.createEl("input", {
          type: "number",
          id: "wMinInput",
          value: String(this.getWMin()),
          placeholder: "",
          style: "",
        });
        const minReset = this.createEl("span", {
          className: "ah-reset",
          text: "↺",
          title: "Reset to default",
        });
        minReset.addEventListener("click", () => {
          this.saveSetting(this.settingsKeys.w_min, "");
          minInput.value = "";
        });
  
        minRow.appendChild(minLabel);
        minRow.appendChild(minInput);
        minRow.appendChild(minReset);
        panel.appendChild(minRow);
  
        const maxRow = this.createEl("div", {
          style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;",
        });
        const maxLabel = this.createEl("label", {
          text: "Maximum words (optional):",
          style: "min-width:160px;",
        });
        const maxInput = this.createEl("input", {
          type: "number",
          id: "wMaxInput",
          value: String(this.getWMax()),
          placeholder: "",
          style: "",
        });
        const maxReset = this.createEl("span", {
          className: "ah-reset",
          text: "↺",
          title: "Reset to default",
        });
        maxReset.addEventListener("click", () => {
          this.saveSetting(this.settingsKeys.w_max, "");
          maxInput.value = "";
        });
  
        maxRow.appendChild(maxLabel);
        maxRow.appendChild(maxInput);
        maxRow.appendChild(maxReset);
        panel.appendChild(maxRow);
  
        const levelRow = this.createEl("div", {
          style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;",
        });
        const levelLabel = this.createEl("label", {
          text: "English level:",
          style: "min-width:160px;",
        });
        const levelSelect = this.createEl("select", { id: "wLevelSelect" });
        ["A1", "A2", "B1", "B2", "C1", "C2"].forEach((l) => {
          const opt = document.createElement("option");
          opt.value = l;
          opt.text = l;
          levelSelect.appendChild(opt);
        });
        levelSelect.value = this.getWLevel();
        levelRow.appendChild(levelLabel);
        levelRow.appendChild(levelSelect);
        panel.appendChild(levelRow);
  
        const blRow = this.createEl("div", {
          style:
            "display:flex;flex-direction:row;align-items:center;gap:8px;margin-bottom:8px;width:100%;",
        });
        const blLabel = this.createEl("label", {
          text: "Blacklist characters:",
          style: "min-width:160px;",
        });
        const blInput = this.createEl("input", {
          type: "text",
          id: "wBlacklistInput",
          value: this.getWBlacklist(),
          placeholder: "\\*, ~, etc",
          style: "flex:1;",
        });
        const blReset = this.createEl("span", {
          className: "ah-reset",
          text: "↺",
          title: "Reset to default",
        });
        blReset.addEventListener("click", () => {
          this.saveSetting(this.settingsKeys.w_blacklist, "");
          blInput.value = "";
        });
  
        blRow.appendChild(blLabel);
        blRow.appendChild(blInput);
        blRow.appendChild(blReset);
        panel.appendChild(blRow);
  
        const lcRow = this.createEl("div", {
          style: "display:flex;align-items:center;gap:8px;margin-bottom:8px;",
        });
        const lcLabel = this.createEl("label", {
          text: "Only lowercase (client-side):",
          style: "min-width:160px;",
        });
        const lcInput = this.createEl("input", {
          type: "checkbox",
          id: "wLowercaseInput",
        });
        lcInput.checked = this.getWLowercase();
        lcRow.appendChild(lcLabel);
        lcRow.appendChild(lcInput);
        panel.appendChild(lcRow);
  
        const moodRow = this.createEl("div", {
          style:
            "display:flex;flex-direction:column;gap:6px;margin-bottom:8px;width:100%;",
        });
        const moodLabel = this.createEl("label", {
          text: "AI writing style / mood (optional):",
          style: "min-width:160px;",
        });
        const moodInput = this.createEl("textarea", {
          id: "wMoodInput",
          value: this.getWMood(),
          placeholder:
            "e.g., Write concisely and politely, target an 11th-grade audience.",
        });
        const moodReset = this.createEl("span", {
          className: "ah-reset",
          text: "↺",
          title: "Reset to default",
        });
        moodReset.addEventListener("click", () => {
          this.saveSetting(this.settingsKeys.w_mood, "");
          moodInput.value = "";
        });
  
        moodRow.appendChild(moodLabel);
        moodRow.appendChild(moodInput);
        moodRow.appendChild(moodReset);
        panel.appendChild(moodRow);
  
        levelSelect.addEventListener("change", () => {
          this.saveSetting(this.settingsKeys.w_level, levelSelect.value);
        });
        blInput.addEventListener("change", () => {
          this.saveSetting(this.settingsKeys.w_blacklist, blInput.value || "");
        });
        lcInput.addEventListener("change", () => {
          this.saveSetting(
            this.settingsKeys.w_lowercase,
            lcInput.checked ? "true" : "false"
          );
        });
        moodInput.addEventListener("change", () => {
          this.saveSetting(this.settingsKeys.w_mood, moodInput.value || "");
        });
        minInput.addEventListener("change", () => {
          this.saveSetting(this.settingsKeys.w_min, minInput.value || "");
        });
        maxInput.addEventListener("change", () => {
          this.saveSetting(this.settingsKeys.w_max, maxInput.value || "");
        });
      }
  
      openAISettings() {
        const panel = document.getElementById("settingsPanel");
        const expandRight = this._computeExpandRight();
        this._setLauncherWidthAndAnchor(520, expandRight);
        this.settingsState = "ai";
        if (!panel) return;
        panel.innerHTML = "";
  
        const title = this.createEl("div", {
          className: "ah-section-title",
          text: "AI Settings",
        });
        panel.appendChild(title);
  
        const DEFAULT_URL = "https://openrouter.ai/api/v1/chat/completions";
        const DEFAULT_MODEL = "inclusionai/ling-2.6-flash:free";
  
        // URL
        const urlRow = this.createEl("div", {
          style:
            "display:flex;align-items:center;gap:8px;margin-bottom:8px;width:100%;",
        });
        const urlLabel = this.createEl("label", {
          text: "OpenRouter URL:",
          style: "min-width:160px;",
        });
        const urlInput = this.createEl("input", {
          type: "text",
          id: "aiGroqUrlInput",
          value: this.loadSetting(this.settingsKeys.ai_groq_url, DEFAULT_URL),
          style: "flex:1;",
        });
        const urlReset = this.createEl("span", {
          className: "ah-reset",
          text: "↺",
          title: "Reset to default",
        });
        urlReset.addEventListener("click", () => {
          urlInput.value = DEFAULT_URL;
          this.saveSetting(this.settingsKeys.ai_groq_url, DEFAULT_URL);
        });
        urlInput.addEventListener("change", () =>
          this.saveSetting(
            this.settingsKeys.ai_groq_url,
            urlInput.value || DEFAULT_URL
          )
        );
        urlRow.appendChild(urlLabel);
        urlRow.appendChild(urlInput);
        urlRow.appendChild(urlReset);
        panel.appendChild(urlRow);
  
        // model settings
        const modelRow = this.createEl("div", {
          style:
            "display:flex;align-items:center;gap:8px;margin-bottom:8px;width:100%;",
        });
        const modelLabel = this.createEl("label", {
          text: "Model:",
          style: "min-width:160px;",
        });
        const modelInput = this.createEl("input", {
          type: "text",
          id: "aiGroqModelInput",
          value: this.loadSetting(this.settingsKeys.ai_groq_model, DEFAULT_MODEL),
          style: "flex:1;",
        });
        const modelReset = this.createEl("span", {
          className: "ah-reset",
          text: "↺",
          title: "Reset to default",
        });
        modelReset.addEventListener("click", () => {
          modelInput.value = DEFAULT_MODEL;
          this.saveSetting(this.settingsKeys.ai_groq_model, DEFAULT_MODEL);
        });
        modelInput.addEventListener("change", () =>
          this.saveSetting(
            this.settingsKeys.ai_groq_model,
            modelInput.value || DEFAULT_MODEL
          )
        );
        modelRow.appendChild(modelLabel);
        modelRow.appendChild(modelInput);
        modelRow.appendChild(modelReset);
        panel.appendChild(modelRow);
  
        // legacy ( single ) api from 1.7
        const KEY_VIS_KEY =
          this.settingsKeys.ai_key_visible || "ah_ai_groq_key_visible";
        const isKeyVisible = this.loadSetting(KEY_VIS_KEY, "false") === "true";
  
        const EYE_SVG = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8"/><circle cx="12" cy="12" r="3"/></svg>
    `;
  
        const EYE_OFF_SVG = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8m4-8 16 16"/></svg>
    `;
  
        const keyRow = this.createEl("div", {
          style:
            "display:flex;align-items:center;gap:8px;margin-bottom:8px;width:100%;",
        });
        const keyLabel = this.createEl("label", {
          text: "API key:",
          style: "min-width:160px;",
        });
        const keyInput = this.createEl("input", {
          type: isKeyVisible ? "text" : "password",
          id: "aiGroqKeyInput",
          value: this.loadSetting(this.settingsKeys.ai_groq_key, ""),
          placeholder: "paste key here",
          style: "flex:1;",
        });
  
        const eyeBtn = this.createEl("button", {
          type: "button",
          id: "aiGroqKeyVisBtn",
          title: "Toggle visibility",
          innerHTML: isKeyVisible ? EYE_OFF_SVG : EYE_SVG,
          style:
            "background:transparent;border:none;color:#cfcfcf;cursor:pointer;padding:4px 6px;border-radius:6px;opacity:0.9;",
        });
  
        const applyKeyVisibility = (visible) => {
          keyInput.type = visible ? "text" : "password";
          eyeBtn.innerHTML = visible ? EYE_OFF_SVG : EYE_SVG;
          this.saveSetting(KEY_VIS_KEY, visible ? "true" : "false");
        };
  
        eyeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const nowVisible = keyInput.type === "password";
          applyKeyVisibility(nowVisible);
        });
  
        keyInput.addEventListener("change", () =>
          this.saveSetting(this.settingsKeys.ai_groq_key, keyInput.value || "")
        );
  
        keyRow.appendChild(keyLabel);
        keyRow.appendChild(keyInput);
        keyRow.appendChild(eyeBtn);
        panel.appendChild(keyRow);
      }
  
      backFromSettings() {
        const launcher = document.getElementById("Launcher");
        const eye = document.getElementById("helperEye");
        const btn = document.getElementById("getAnswerButton");
        const settingsPanel = document.getElementById("settingsPanel");
        const settingsCog = document.getElementById("settingsCog");
        const settingsBack = document.getElementById("settingsBack");
  
        if (
          this.settingsState === "mc" ||
          this.settingsState === "writing" ||
          this.settingsState === "ai"
        ) {
          // shrink to menu view
          const expandRight = this._computeExpandRight();
          this._setLauncherWidthAndAnchor(360, expandRight);
          this.settingsState = "menu";
          this.buildSettingsMenu();
          return;
        }
  
        if (this.settingsState === "menu") {
          // hide panel
          if (settingsPanel) {
            settingsPanel.style.opacity = "0";
            settingsPanel.style.pointerEvents = "none";
            settingsPanel.style.transitionDelay = "0s";
            settingsPanel.style.visibility = "hidden";
            settingsPanel.innerHTML = "";
          }
  
          // restore main button
          if (btn) {
            btn.style.display = "flex";
            setTimeout(() => (btn.style.opacity = "1"), 10);
          }
          // restore cog/back
          if (settingsBack) {
            settingsBack.style.opacity = "0";
            setTimeout(() => (settingsBack.style.display = "none"), 120);
          }
          if (settingsCog) settingsCog.style.display = "block";
          // shrink launcher back (decide anchor based on current rect, restore to default 180)
          const expandRight = this._computeExpandRight();
          this._setLauncherWidthAndAnchor(180, expandRight);
          if (launcher) launcher.style.height = "240px";
          // restore eye full size & original placement
          this._restoreEyeFromShrink();
          this.settingsState = "closed";
          return;
        }
      }
  
      // -------- event wiring & behavior (includes settings triggers and random MC logic) --------
      setupEventListeners() {
        try {
          const launcher = document.getElementById("Launcher");
          const answerContainer = document.getElementById("answerContainer");
          const getAnswerButton = launcher
            ? launcher.querySelector("#getAnswerButton")
            : null;
          if (!launcher || !answerContainer || !getAnswerButton) return;
  
          const closeButton = launcher.querySelector("#closeButton");
          const closeAnswerButton =
            answerContainer.querySelector("#closeAnswerButton");
  
          this.applyStylesOnce(
            "assessment-helper-styles",
            `
                      #closeButton:hover, #closeAnswerButton:hover { color: #ff6b6b; opacity: 1 !important; }
                      #closeButton:active, #closeAnswerButton:active { color: #e05252; transform: scale(0.95); }
                      #getAnswerButton { position: relative; z-index: 100001; transition: background 0.2s ease, transform 0.1s ease; }
                      #getAnswerButton:hover { background: #1f1f1f !important; }
                      #getAnswerButton:active { background: #4c4e5b !important; transform: scale(0.98); }
                      #getAnswerButton:disabled { opacity: 0.6; cursor: not-allowed; }
                      .answerLauncher.show { opacity: 1; visibility: visible; transform: translateY(-50%) scale(1); }
                      /* Make settings panel scrollbars less ugly */
                      #settingsPanel{
                        overflow-y:auto;
                        padding-right:6px;              /* scrollbar content üstüne binmesin */
                        scrollbar-width: thin;          /* Firefox */
                        scrollbar-color: rgba(255,255,255,0.22) rgba(255,255,255,0.06);
                      }
  
                      /* Chrome/Edge/Safari */
                      #settingsPanel::-webkit-scrollbar{ width:8px; }
                      #settingsPanel::-webkit-scrollbar-track{
                        background: rgba(255,255,255,0.06);
                        border-radius: 10px;
                      }
                      #settingsPanel::-webkit-scrollbar-thumb{
                        background: rgba(255,255,255,0.18);
                        border-radius: 10px;
                        border: 2px solid rgba(0,0,0,0.35);
                      }
                      #settingsPanel::-webkit-scrollbar-thumb:hover{
                        background: rgba(255,255,255,0.28);
                      }
  
                      #settingsPanel input,
                      #settingsPanel textarea,
                      #settingsPanel select{
                        box-sizing: border-box;
                      }
          `
          );
  
          if (typeof Draggabilly !== "undefined") {
            try {
              new Draggabilly(launcher, { handle: ".drag-handle", delay: 50 });
            } catch (e) {}
          }
  
          const answerDragHandle = answerContainer.querySelector(
            ".answer-drag-handle"
          );
          if (answerDragHandle) {
            answerDragHandle.addEventListener("mousedown", (e) => {
              e.preventDefault();
              this.answerIsDragging = true;
              const rect = answerContainer.getBoundingClientRect();
              this.answerInitialX = e.clientX - rect.left;
              this.answerInitialY = e.clientY - rect.top;
              answerContainer.style.position = "fixed";
            });
          }
  
          document.addEventListener("mousemove", (e) => {
            if (this.answerIsDragging && answerContainer) {
              e.preventDefault();
              const newX = e.clientX - this.answerInitialX;
              const newY = e.clientY - this.answerInitialY;
              answerContainer.style.left = `${newX}px`;
              answerContainer.style.top = `${newY}px`;
              answerContainer.style.right = "";
              answerContainer.style.bottom = "";
              answerContainer.style.transform = "none";
            }
          });
  
          const stopDrag = () => (this.answerIsDragging = false);
          document.addEventListener("mouseup", stopDrag);
          document.addEventListener("mouseleave", stopDrag);
  
          if (closeButton) {
            closeButton.addEventListener("click", () => {
              try {
                // stop any running solver immediately and abort fetches
                if (
                  window.__AssessmentHelperInstance &&
                  typeof window.__AssessmentHelperInstance
                    .stopProcessImmediate === "function"
                ) {
                  try {
                    window.__AssessmentHelperInstance.stopProcessImmediate();
                  } catch (e) {}
                }
              } catch (e) {}
  
              // fade out
              launcher.style.opacity = 0;
  
              // remove DOM nodes after fade completes, and clear global reference
              launcher.addEventListener(
                "transitionend",
                function handler() {
                  try {
                    // remove the whole container that holds the launcher
                    const launcherEl = document.getElementById("Launcher");
                    if (launcherEl && launcherEl.parentElement)
                      launcherEl.parentElement.remove();
  
                    // remove answer UI container's parent (if present)
                    const answerEl = document.getElementById("answerContainer");
                    if (answerEl && answerEl.parentElement)
                      answerEl.parentElement.remove();
  
                    // clear any global pointer to instance
                    try {
                      window.__AssessmentHelperInstance = null;
                    } catch (e) {}
                  } catch (e) {}
  
                  launcher.removeEventListener("transitionend", handler);
                },
                { once: true }
              );
            });
  
            closeButton.addEventListener(
              "mousedown",
              () => (closeButton.style.transform = "scale(0.95)")
            );
            closeButton.addEventListener(
              "mouseup",
              () => (closeButton.style.transform = "scale(1)")
            );
          }
  
          if (closeAnswerButton) {
            closeAnswerButton.addEventListener("click", () => {
              answerContainer.style.opacity = 0;
              answerContainer.style.transform = "translateY(-50%) scale(0.8)";
              answerContainer.addEventListener(
                "transitionend",
                function handler() {
                  if (parseFloat(answerContainer.style.opacity) === 0) {
                    answerContainer.style.display = "none";
                    answerContainer.style.visibility = "hidden";
                    answerContainer.style.transform = "translateY(-50%) scale(1)";
                    answerContainer.removeEventListener("transitionend", handler);
                  }
                },
                { once: true }
              );
            });
            closeAnswerButton.addEventListener(
              "mousedown",
              () => (closeAnswerButton.style.transform = "scale(0.95)")
            );
            closeAnswerButton.addEventListener(
              "mouseup",
              () => (closeAnswerButton.style.transform = "scale(1)")
            );
          }
  
          getAnswerButton.addEventListener("mouseenter", async () => {
            try {
              await this.handleHoverEnter();
            } catch (e) {}
            getAnswerButton.style.background = "#1f1f1f";
          });
          getAnswerButton.addEventListener("mouseleave", async () => {
            try {
              await this.handleHoverLeave();
            } catch (e) {}
            getAnswerButton.style.background = "#151515";
          });
          getAnswerButton.addEventListener(
            "mousedown",
            () => (getAnswerButton.style.transform = "scale(0.98)")
          );
          getAnswerButton.addEventListener(
            "mouseup",
            () => (getAnswerButton.style.transform = "scale(1)")
          );
  
          // toggle start/stop
          getAnswerButton.addEventListener("click", async () => {
            if (!this.isRunning) {
              this.isRunning = true;
              this._stoppedByWrite = false;
              await this.startProcessUI();
              try {
                this.setEyeToFull();
              } catch (e) {}
              this.runSolverLoop();
            } else {
              this.stopProcessImmediate();
              await this.stopProcessUI();
            }
          });
  
          // settings cog/back wiring
          const settingsCog = document.getElementById("settingsCog");
          const settingsBack = document.getElementById("settingsBack");
          if (settingsCog)
            settingsCog.addEventListener("click", (e) => {
              e.preventDefault();
              this.openSettingsMenu();
            });
          if (settingsBack)
            settingsBack.addEventListener("click", (e) => {
              e.preventDefault();
              this.backFromSettings();
            });
        } catch (e) {}
      }
  
      // -------- solver loop (uses settings & random MC) --------
      async runSolverLoop() {
        const attemptOnce = async (excludedAnswers = []) => {
          if (!this.isRunning) return false;
      
          try {
            let queryContent = await this.fetchArticleContent();
const choices = this.getChoices();

if (!choices.length) {
  console.warn("No choices found");
}

const choiceLines = choices.map(c => `${c.letter}. ${c.text}`).join("\n");

queryContent = `${queryContent}

CHOICES:
${choiceLines}

PROVIDE ONLY A ONE-LETTER ANSWER THAT'S IT NOTHING ELSE (A, B, C, or D).`;
      
            if (excludedAnswers.length > 0) {
              queryContent += `\n\nDo not pick letter ${excludedAnswers.join(", ")}.`;
            }
      
            try {
              console.groupCollapsed("[smArt] Sent (MC) payload");
              console.log("q:", queryContent);
              console.log("article:", this.cachedArticle || null);
              console.groupEnd();
            } catch (e) {}
      
            const randPct = this.getMCRandomPct();
            let willRandom = false;
      
            try {
              if (randPct > 0) {
                willRandom = Math.random() * 100 < randPct;
              }
            } catch (e) {
              willRandom = false;
            }
      
            let answer = null;
      
            if (willRandom) {
              const letters = ["A", "B", "C", "D"].filter(
                (l) => !excludedAnswers.includes(l)
              );
      
              const options = document.querySelectorAll('[role="radio"]');
              let chosenLetter = null;
      
              if (options && options.length > 0) {
                const available = letters
                  .map((l) => l.charCodeAt(0) - "A".charCodeAt(0))
                  .filter((i) => options[i]);
      
                if (available.length > 0) {
                  const idx =
                    available[Math.floor(Math.random() * available.length)];
                  chosenLetter = String.fromCharCode("A".charCodeAt(0) + idx);
                } else {
                  chosenLetter =
                    letters[Math.floor(Math.random() * letters.length)];
                }
              } else {
                chosenLetter = letters[Math.floor(Math.random() * letters.length)];
              }
      
              answer = chosenLetter;
      
              try {
                console.groupCollapsed("[smArt] Random MC decision");
                console.log("Random decision triggered (pct):", randPct);
                console.log("Chosen letter:", chosenLetter);
                console.groupEnd();
              } catch (e) {}
            } else {
              answer = await this.fetchAnswer(queryContent);
      
              try {
                console.groupCollapsed("[smArt] Received (MC) answer");
                console.log(answer);
                console.groupEnd();
              } catch (e) {}
            }
      
            if (!this.isRunning) return false;
      
            const raw = String(answer || "");
            let normalized = "";
      
            const firstLetterMatch = raw.match(/[A-Da-d]/);
            if (firstLetterMatch && firstLetterMatch[0]) {
              normalized = firstLetterMatch[0].toUpperCase();
            } else {
              const cleaned = raw.replace(/[^A-Da-d]/g, "").toUpperCase();
              normalized = cleaned ? cleaned.charAt(0) : "";
            }
      
            const answerContainerEl = document.getElementById("answerContainer");
            const answerContentEl = answerContainerEl
              ? answerContainerEl.querySelector("#answerContent")
              : null;
      
            if (answerContentEl) {
              answerContentEl.textContent =
                normalized || (raw.trim().length ? raw.trim() : answer);
            }
      
            if (answerContainerEl) {
              answerContainerEl.style.display = "flex";
              answerContainerEl.style.visibility = "visible";
              answerContainerEl.classList.add("show");
            }
      
            if (
              ["A", "B", "C", "D"].includes(normalized) &&
              !excludedAnswers.includes(normalized)
            ) {
              const options = document.querySelectorAll('[role="radio"]');
              const index = normalized.charCodeAt(0) - "A".charCodeAt(0);
      
              if (options[index]) {
                options[index].click();
                await new Promise((r) => setTimeout(r, 500));
      
                if (!this.isRunning) return false;
      
                const submitButton = Array.from(
                  document.querySelectorAll("button")
                ).find((b) => b.textContent.trim() === "Submit");
      
                if (submitButton) {
                  setTimeout(function(){
    submitButton.click()
}, 3000);
                  await new Promise((r) => setTimeout(r, 1000));
      
                  if (!this.isRunning) return false;
                  setTimeout(function(){
                    submitButton.click()
                }, 1000);

                      return await attemptOnce([
                        ...excludedAnswers,
                        normalized,
                      ]);

                } else {
                  if (answerContentEl) {
                    answerContentEl.textContent =
                      "Error: Submit button not found.";
                  }
                  return false;
                }
              } else {
                if (answerContentEl) {
                  answerContentEl.textContent = `Error: Option ${normalized} not found on page.`;
                }
                return false;
              }
            } else {
              if (answerContentEl) {
                answerContentEl.textContent = `Model returned: ${
                  answer || "No valid single letter"
                }`;
              }
              return false;
            }
          } catch (err) {
            if (
              String((err && err.message) || "")
                .toLowerCase()
                .includes("aborted") ||
              String(err) === "Error: <<ABORTED>>"
            ) {
              return false;
            }
      
            const answerContainerEl = document.getElementById("answerContainer");
            const answerContentEl = answerContainerEl
              ? answerContainerEl.querySelector("#answerContent")
              : null;
      
            if (answerContentEl) {
              answerContentEl.textContent = `Error: ${
                err && err.message ? err.message : String(err)
              }`;
            }
      
            if (answerContainerEl) {
              answerContainerEl.style.display = "flex";
              answerContainerEl.style.visibility = "visible";
              answerContainerEl.classList.add("show");
            }
      
            return false;
          }
        };
      
        try {
          while (this.isRunning) {
            const cont = await attemptOnce();
            if (!this.isRunning) break;
            if (!cont) break;
      
            const waitMs = Number(this.getMCWait()) || this.defaults.mc_wait;
            await new Promise((r) => setTimeout(r, waitMs));
          }
        } finally {
          this.isRunning = false;
      
          const spinnerEl = document.getElementById("ah-spinner");
          if (spinnerEl) spinnerEl.style.display = "none";
      
          try {
            await this.playVideoOnce(this.getUrl("icons/gotosleep.webm"));
          } catch (e) {}
      
          this.setEyeToSleep();
      
          try {
            console.log("[smArt] stopped");
          } catch (e) {}
      
          const label = document.getElementById("getAnswerButtonText");
          if (label) label.textContent = "work smArt-er";
      
          const btn = document.getElementById("getAnswerButton");
          if (btn) btn.classList.remove("running");
        }
      }
    }
  
    try {
      new AssessmentHelper();
    } catch (e) {}
  })();
