// === SET THIS to your Render backend base URL ===
const BACKEND_BASE = "https://eportfolio-gemini-api.onrender.com";
const ACCESS_KEY = "dd2abd17f906a7743d44a18844de3b08"; // 

// ===== elements =====
const AV = document.getElementById("chat-avatar");
const PAN = document.getElementById("chat-panel");
const CLOSE = document.getElementById("chat-close");
const BODY = document.getElementById("chat-body");
const FORM = document.getElementById("chat-form");
const INPUT = document.getElementById("chat-input");
const SEND = document.getElementById("chat-send");
const BETA_BANNER = document.getElementById("chat-beta-banner");
const BETA_DISMISS = document.getElementById("chat-beta-dismiss");


// Suggested questions
const DEFAULT_SUGGESTIONS = [
    "Tell me about your work at Intel",
    //"What technologies do you use?",
    "What kind of projects have you done?",
    "What is your educational background?",
    "Summarize your professional experience",
];

const HINT = document.getElementById("chat-hint");
function showHint() { HINT.classList.add("show"); }
function hideHint() { HINT.classList.remove("show"); }
// Wiggle the avatar if user ignores it for a few seconds
let wiggleTimer;

function triggerWiggle() {
    if (AV.classList.contains("bounce-once")) {
        AV.classList.add("wiggle");
        setTimeout(() => AV.classList.remove("wiggle"), 1000); // remove after animation
    }
}

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

// Start a timer when the avatar becomes visible
function startWiggleTimer() {
    clearTimeout(wiggleTimer);
    wiggleTimer = setTimeout(triggerWiggle, 10000); // 10s after visible, do a wiggle
}

// Reset wiggle timer if user hovers or interacts
["mouseenter", "focus", "click"].forEach(ev => {
    AV.addEventListener(ev, () => clearTimeout(wiggleTimer));
    AV.addEventListener(ev, hideHint);
});

// Re-start timer if user moves mouse away
AV.addEventListener("mouseleave", startWiggleTimer);

// Integrate with IntersectionObserver (run only once)
const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            showHint();
            AV.classList.add("bounce-once");
            startWiggleTimer();
            obs.disconnect(); // stop observing after first bounce
        }
    });
}, { threshold: 0.5 });

observer.observe(AV);


function show(v) { PAN.style.display = v ? "block" : "none"; if (v) INPUT.focus(); }
AV.addEventListener("click", () => { hideHint(); show(true); maybeShowBetaBanner(); showSuggestions(); });
CLOSE.addEventListener("click", () => show(false));
AV.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(true); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && PAN.style.display === "block") show(false); });

function showSuggestions() {
    // If chat already has messages, don't show suggestions
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
            container.remove(); // remove the buttons
            INPUT.value = q;
            FORM.dispatchEvent(new Event("submit"));
        };
        container.appendChild(btn);
    });

    BODY.appendChild(container);
    BODY.scrollTop = BODY.scrollHeight;
}

// message helpers
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

async function askBackend(message) {
    const headers = { "Content-Type": "application/json" };
    if (ACCESS_KEY) headers["x-access-key"] = ACCESS_KEY;

    const res = await fetch(`${BACKEND_BASE}/resume-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message })
    });

    // try to parse either way
    let data = {};
    try { data = await res.json(); } catch { }
    if (!res.ok) {
        if (res.status === 429) throw new Error(data.error || "Rate limited / free-tier quota reached. Try later.");
        throw new Error(data.error || `Service error (${res.status})`);
    }
    return data; // { reply, model, sources }
}

let idleTimer;
function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        if (BODY.children.length === 0 || BODY.children.length < 2) showSuggestions();
    }, 30000); // 30s idle
}
document.addEventListener("click", resetIdle);
document.addEventListener("keydown", resetIdle);

FORM.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = INPUT.value.trim();
    if (!msg) return;
    INPUT.value = "";
    addMsg(msg, "user");
    const note = document.createElement("div");
    note.className = "msg note";
    note.innerHTML = `Thinking <div class="typing"><span></span><span></span><span></span></div>`;
    BODY.appendChild(note);
    BODY.scrollTop = BODY.scrollHeight;


    INPUT.disabled = true; SEND.disabled = true;
    try {
        const data = await askBackend(msg);
        note.remove();
        addMsg(data.reply || "(no reply)", "bot");
        if (data.model) addNote(`Model: ${data.model}`);
    } catch (err) {
        note.remove();
        addMsg(`⚠️ ${err.message}`, "bot");
    } finally {
        INPUT.disabled = false; SEND.disabled = false; INPUT.focus();
    }
});
