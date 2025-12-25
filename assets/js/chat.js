// === SET THIS to your Render backend base URL ===
const BACKEND_BASE = "https://eportfolio-gemini-api-c8fo.onrender.com" || "https://eportfolio-gemini-api.onrender.com";
const ACCESS_KEY = "dd2abd17f906a7743d44a18844de3b08"; // 

// Treat coarse pointers (touch) as mobile/tablet
const IS_MOBILE = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

// ===== elements =====
const AV = document.getElementById("chat-avatar");
const AI_CHAT_PROR = document.getElementById("ai-chat-project");
const PAN = document.getElementById("chat-panel");
const CLOSE = document.getElementById("chat-close");
const BODY = document.getElementById("chat-body");
const FORM = document.getElementById("chat-form");
const INPUT = document.getElementById("chat-input");
const SEND = document.getElementById("chat-send");
const BETA_BANNER = document.getElementById("chat-beta-banner");
const BETA_DISMISS = document.getElementById("chat-beta-dismiss");
const HINT = document.getElementById("chat-hint");

// Suggested questions
const DEFAULT_SUGGESTIONS = [
    "What technologies do you use?",
    "What kind of projects have you done?",
    "What is your educational background?",
    "Summarize your professional experience",
];

// State
let wiggleTimer;
let idleTimer;
let LAST_PROMPT = "";
let LAST_BOT_DIV = null; // last bot bubble so we can replace it on Regenerate

// --- Hint (little “Click to chat”) ---
function showHint() { HINT && HINT.classList.add("show"); }
function hideHint() { HINT && HINT.classList.remove("show"); }

// --- Beta banner (once per tab session) ---
function maybeShowBetaBanner() {
    const dismissed = sessionStorage.getItem("cbBetaDismissed") === "1";
    if (!dismissed && BETA_BANNER) BETA_BANNER.style.display = "block";
}
if (BETA_DISMISS) {
    BETA_DISMISS.addEventListener("click", () => {
        sessionStorage.setItem("cbBetaDismissed", "1");
        BETA_BANNER.style.display = "none";
    });
}

// --- Avatar bounce & wiggle to attract attention ---
AV.setAttribute("title", "Click to chat"); // native tooltip
function triggerWiggle() {
    if (AV.classList.contains("bounce-once")) {
        AV.classList.add("wiggle");
        setTimeout(() => AV.classList.remove("wiggle"), 1000);
    }
}
function startWiggleTimer() {
    clearTimeout(wiggleTimer);
    wiggleTimer = setTimeout(triggerWiggle, 10000);
}
["mouseenter", "focus", "click"].forEach((ev) => {
    AV.addEventListener(ev, () => clearTimeout(wiggleTimer));
    AV.addEventListener(ev, hideHint);
});
AV.addEventListener("mouseleave", startWiggleTimer);

const observer = new IntersectionObserver(
    (entries, obs) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                showHint();
                AV.classList.add("bounce-once");
                startWiggleTimer();
                obs.disconnect();
            }
        });
    },
    { threshold: 0.5 }
);
observer.observe(AV);

// --- Open/close panel ---
function show(v) {
    PAN.style.display = v ? "block" : "none";

    // Desktop: focus input when opening
    if (v && !IS_MOBILE) {
        INPUT.focus();
    }

    // Mobile: prevent keyboard on open
    if (v && IS_MOBILE) {
        // Optional “no-keyboard on open” trick:
        INPUT.setAttribute("readonly", "readonly");
        const enableTyping = () => {
            INPUT.removeAttribute("readonly");
            INPUT.focus();              // user explicitly tapped, OK to open keyboard
        };
        // Enable typing on first tap inside the input
        INPUT.addEventListener("touchstart", enableTyping, { once: true });
    }
}

AV.addEventListener("click", () => {
    hideHint();
    show(true);              // no focus on mobile
    maybeShowBetaBanner?.();
    showSuggestions();
});

CLOSE.addEventListener("click", () => show(false));
AV.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        show(true);
    }
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && PAN.style.display === "block") show(false);
});

//-- When click AI_CHAT_PROR Project ----
AI_CHAT_PROR.addEventListener("click", () => {
    AV.click();
});

// --- Suggestions (first open / idle) ---
function showSuggestions() {
    if (BODY.children.length > 0) return;
    const container = document.createElement("div");
    container.className = "msg bot";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "6px";

    DEFAULT_SUGGESTIONS.forEach((q) => {
        const btn = document.createElement("button");
        btn.textContent = q;
        btn.className = "suggestion-btn";
        btn.type = "button";
        btn.onclick = () => {
            container.remove();
            INPUT.value = q;
            FORM.dispatchEvent(new Event("submit"));
        };
        container.appendChild(btn);
    });

    BODY.appendChild(container);
    BODY.scrollTop = BODY.scrollHeight;
}
function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        if (BODY.children.length === 0 || BODY.children.length < 2) showSuggestions();
    }, 30000);
}
document.addEventListener("click", resetIdle);
document.addEventListener("keydown", resetIdle);

// --- Message helpers ---
function addMsg(text, who = "bot") {
    const div = document.createElement("div");
    div.className = `msg ${who === "user" ? "user" : "bot"}`;
    div.textContent = text;
    BODY.appendChild(div);
    BODY.scrollTop = BODY.scrollHeight;
    return div;
}
function addNote(text) {
    const div = document.createElement("div");
    div.className = "msg note";
    div.textContent = text;
    BODY.appendChild(div);
    BODY.scrollTop = BODY.scrollHeight;
    return div;
}

// --- Toolbar under bot replies (Regenerate + model tag) ---
function attachBotToolbar(botDiv, data) {
    const bar = document.createElement("div");
    bar.className = "msg-toolbar";
    bar.innerHTML = `
    <button type="button" class="msg-tool" id="regen-btn">↻ Regenerate</button>
    ${data?.model ? `<span class="msg-meta">Model: ${data.model}</span>` : ""}
  `;
    botDiv.appendChild(bar);

    const regen = bar.querySelector("#regen-btn");
    regen.addEventListener("click", async () => {
        if (!LAST_PROMPT) return;

        const thinking = document.createElement("div");
        thinking.className = "thinking-inline";
        thinking.innerHTML = `<div class="typing"><span></span><span></span><span></span></div>`;
        bar.replaceWith(thinking);

        INPUT.disabled = true;
        SEND.disabled = true;
        try {
            const data2 = await askBackend(LAST_PROMPT);
            // Replace last bot content with the new text
            LAST_BOT_DIV.textContent = "";
            LAST_BOT_DIV.className = "msg bot";
            LAST_BOT_DIV.appendChild(document.createTextNode(data2.reply || "(no reply)"));
            attachBotToolbar(LAST_BOT_DIV, data2);
            BODY.scrollTop = BODY.scrollHeight;
        } catch (err) {
            LAST_BOT_DIV.appendChild(document.createElement("br"));
            LAST_BOT_DIV.appendChild(document.createTextNode(` ⚠️ ${err.message}`));
        } finally {
            INPUT.disabled = false;
            SEND.disabled = false;
            if (IS_MOBILE) INPUT.blur();
        }
    });
}

// --- Backend call ---
async function askBackend(message) {
    const headers = { "Content-Type": "application/json" };
    if (ACCESS_KEY) headers["x-access-key"] = ACCESS_KEY;

    const res = await fetch(`${BACKEND_BASE}/resume-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message }),
    });

    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    if (!res.ok) {
        if (res.status === 429) throw new Error(data.error || "Rate limited / free-tier quota reached. Try later.");
        throw new Error(data.error || `Service error (${res.status})`);
    }
    return data; // { reply, model, sources, beta? }
}

// --- Form submit ---
FORM.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = INPUT.value.trim();
    LAST_PROMPT = msg;
    LAST_BOT_DIV = null;

    if (!msg) return;
    INPUT.value = "";
    addMsg(msg, "user");

    const note = document.createElement("div");
    note.className = "msg note";
    note.innerHTML = `Thinking <div class="typing"><span></span><span></span><span></span></div>`;
    BODY.appendChild(note);
    BODY.scrollTop = BODY.scrollHeight;

    INPUT.disabled = true;
    SEND.disabled = true;
    try {
        const data = await askBackend(msg);
        note.remove();
        const botDiv = addMsg(data.reply || "(no reply)", "bot");
        LAST_BOT_DIV = botDiv;
        attachBotToolbar(botDiv, data);
    } catch (err) {
        note.remove();
        const errDiv = addMsg(`⚠️ Oops! The chatbot backend hit the free-tier limit for this month. It’ll be back soon 🙂`, "bot");
        // quick retry button on error
        if (LAST_PROMPT) {
            const retry = document.createElement("button");
            retry.textContent = "Try again";
            retry.className = "msg-tool";
            retry.style.marginTop = "6px";
            retry.onclick = () => { INPUT.value = LAST_PROMPT; FORM.dispatchEvent(new Event("submit")); };
            errDiv.appendChild(document.createElement("br"));
            errDiv.appendChild(retry);
        }
    } finally {
        INPUT.disabled = false;
        SEND.disabled = false;
        if (IS_MOBILE) {
            INPUT.blur();        // keep keyboard closed
        } else {
            INPUT.focus();       // desktop convenience
        }
    }
});

// // --- Keyboard shortcut: R to regenerate ---
// document.addEventListener("keydown", (e) => {
//     if (e.key.toLowerCase() === "r" && PAN.style.display === "block" && LAST_PROMPT && LAST_BOT_DIV) {
//         const btn = LAST_BOT_DIV.querySelector("#regen-btn");
//         btn && btn.click();
//     }
// });
