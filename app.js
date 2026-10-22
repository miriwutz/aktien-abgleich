// ======================================================
// AKTIEN-ABGLEICH – Firebase / Firestore
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// ------------------------------------------------------
// FIREBASE
// ------------------------------------------------------

const firebaseConfig = {
    apiKey: "AIzaSyDgCVWVi77TfmW8U-_r9tk1qMYQGL_iJx4",
    authDomain: "aktien-abgleich.firebaseapp.com",
    projectId: "aktien-abgleich",
    storageBucket: "aktien-abgleich.firebasestorage.app",
    messagingSenderId: "1042057620402",
    appId: "1:1042057620402:web:8ce592c1f5c745f9aad2ab"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);

let stocks = [];
let unsubscribe = null;
let sortMode = "date";
let branchFilter = "";
let stockSearch = "";
let messages = [];
let unsubscribeMessages = null;
let inboxVisible = false;
let notificationEnabled = false;
let knownMessageIds = new Set();
let firstMessageSnapshot = true;

// ------------------------------------------------------
// DANKESSPRÜCHE
// ------------------------------------------------------

const thanksMessages = [
    "Danke, dass du deine Gedanken mit einbringst.",
    "Danke für deine konstruktive Ergänzung.",
    "Danke für deine aktive Beteiligung.",
    "Danke, dass du deine Sichtweise einbringst.",
    "Danke für deinen offenen Blick.",
    "Danke für deine aktive Mithilfe.",
    "Danke für deine Beteiligung.",
    "Danke, dass du das teilst.",
    "Danke für deinen Anstoß.",
    "Danke für deine wertvolle Eingabe.",
    "Danke, dass du weiterdenkst.",
    "Danke für deine Eingabe.",
    "Danke für deine Mithilfe.",
    "Danke für deinen Beitrag.",
    "Danke, dass du das eingebracht hast.",
    "Danke für deinen Impuls.",
    "Danke für deine Gedanken.",
    "Danke für deine Perspektive.",
    "Danke für deine Ergänzung.",
    "Danke, dass du mitwirkst."
];

// ------------------------------------------------------
// HILFSFUNKTIONEN
// ------------------------------------------------------

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function formatMoney(value) {
    if (value === null || value === undefined || value === "") return "–";
    return new Intl.NumberFormat("de-AT", {
        style: "currency",
        currency: "EUR"
    }).format(Number(value));
}

function formatPercent(value) {
    if (value === null || value === undefined || value === "") return "–";
    return Number(value).toLocaleString("de-AT", {
        maximumFractionDigits: 2
    }) + " %";
}

function formatDate(value) {
    if (!value) return "–";
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("de-AT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(date);
}

function isUrl(value) {
    return /^https?:\/\/\S+$/i.test(String(value || "").trim());
}

function showToast(message) {
    const toast = $("toast");
    if (!toast) {
        alert(message);
        return;
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3200);
}

// ------------------------------------------------------
// NACHRICHTEN-PINNWAND & BENACHRICHTIGUNGEN
// ------------------------------------------------------

function formatMessageDate(value) {
    if (!value) return "Gerade eben";
    const date = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "Gerade eben";
    return new Intl.DateTimeFormat("de-AT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function playNotificationSound() {
    const sound = $("notificationSound")?.value || "bling";
    if (sound === "off") return;

    const volumeControl = $("notificationVolume");
    const volumePercent = Number(volumeControl?.value ?? localStorage.getItem("aktienAbgleichNotificationVolume") ?? 100);
    const volume = Math.max(0, Math.min(2, volumePercent / 100));
    if (volume <= 0) return;

    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            showToast("Dein Browser unterstützt den Benachrichtigungston leider nicht.");
            return;
        }

        const context = new AudioContextClass();
        const tones = sound === "soft"
            ? [{ f: 660, t: 0, d: 0.16, v: 0.045 }]
            : sound === "double"
                ? [{ f: 880, t: 0, d: 0.12, v: 0.055 }, { f: 1175, t: 0.16, d: 0.16, v: 0.05 }]
                : [{ f: 1046, t: 0, d: 0.18, v: 0.055 }];

        tones.forEach((tone) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = "sine";
            oscillator.frequency.value = tone.f;
            const peak = Math.min(0.95, tone.v * 3.0 * volume);
            gain.gain.setValueAtTime(0.0001, context.currentTime + tone.t);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), context.currentTime + tone.t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + tone.t + tone.d);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(context.currentTime + tone.t);
            oscillator.stop(context.currentTime + tone.t + tone.d + 0.03);
        });

        setTimeout(() => context.close().catch(() => {}), 900);
    } catch (error) {
        console.warn("Benachrichtigungston konnte nicht abgespielt werden:", error);
    }
}

function showIncomingMessagePopup(message) {
    const popup = $("messagePopup");
    if (!popup) return;
    $("messagePopupTitle").textContent = message.important ? "⭐ Wichtige neue Nachricht" : "Neue Nachricht auf der Pinnwand";
    const preview = String(message.text || "");
    $("messagePopupText").textContent = `${message.sender || "Billy oder Louis"}: ${preview.length > 180 ? preview.slice(0, 180) + "…" : preview}`;
    popup.classList.remove("hidden");
}

function updateUnreadBadge() {
    const badge = $("unreadBadge");
    if (!badge) return;
    const lastSeen = Number(localStorage.getItem("aktienAbgleichMessagesSeenAt") || 0);
    const unread = messages.filter((message) => {
        const created = message.createdAt?.toDate
            ? message.createdAt.toDate().getTime()
            : Number(message.createdAt || 0);
        return created > lastSeen && message.createdByUid !== auth.currentUser?.uid;
    }).length;

    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.classList.toggle("hidden", unread === 0);
}

function markMessagesSeen() {
    localStorage.setItem("aktienAbgleichMessagesSeenAt", String(Date.now()));
    updateUnreadBadge();
}

function renderMessages() {
    const list = [...messages].sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
    });

    $("messageCount").textContent = `${list.length} ${list.length === 1 ? "Nachricht" : "Nachrichten"}`;
    $("messageEmptyState").classList.toggle("hidden", list.length > 0);

    $("messageList").innerHTML = list.map((message) => {
        const sender = String(message.sender || "Billy");
        const senderClass = sender.toLowerCase() === "billy" ? "sender-billy" : "sender-louis";
        const newClass = message.createdByUid !== auth.currentUser?.uid ? "is-new" : "";
        const importantClass = message.important ? "message-important" : "";
        const importantLabel = message.important ? '<span class="important-message-label">★ WICHTIG</span>' : "";

        return `
        <article class="message-card ${senderClass} ${newClass} ${importantClass}">
            <div class="message-card-top">
                <span class="message-sender">${escapeHtml(sender)} ${importantLabel}</span>
                <span class="message-date">${escapeHtml(formatMessageDate(message.createdAt))}</span>
            </div>
            <div class="message-body">${escapeHtml(message.text || "")}</div>
            <div class="message-card-bottom">
                <button type="button" class="message-delete" data-message-delete="${escapeHtml(message.id)}">Löschen</button>
            </div>
        </article>`;
    }).join("");

    updateUnreadBadge();
}

function setInboxVisible(visible) {
    inboxVisible = visible;
    $("stocksPage").classList.toggle("hidden", visible);
    $("inboxPage").classList.toggle("hidden", !visible);
    if (visible) {
        markMessagesSeen();
        renderMessages();
        $("inboxPage").scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
        $("stocksPage").scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

async function enableNotifications() {
    notificationEnabled = true;

    let browserStatus = "Browser-Pop-ups nicht verfügbar";
    if ("Notification" in window) {
        try {
            const permission = await Notification.requestPermission();
            browserStatus = permission === "granted"
                ? "Browser-Benachrichtigungen erlaubt"
                : "Browser-Pop-ups nicht erlaubt";
        } catch {
            browserStatus = "Browser-Pop-ups konnten nicht aktiviert werden";
        }
    }

    $("notificationStatus").textContent =
        `Ton aktiviert · ${browserStatus}. Töne funktionieren, solange die Website geöffnet ist.`;
    $("notificationEnableBtn").textContent = "Benachrichtigungen aktiviert";
    $("notificationEnableBtn").classList.add("notifications-on");
    playNotificationSound();
    showToast("Benachrichtigungen aktiviert – Test-Bling abgespielt.");
}

function notifyNewMessage(message) {
    if (message.createdByUid === auth.currentUser?.uid) return;

    showIncomingMessagePopup(message);
    if (!notificationEnabled) return;
    playNotificationSound();

    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        try {
            new Notification(`Neue Nachricht von ${message.sender || "Billy oder Louis"}`, {
                body: String(message.text || "").slice(0, 150),
                tag: `aktien-message-${message.id}`
            });
        } catch (error) {
            console.warn("Browser-Benachrichtigung fehlgeschlagen:", error);
        }
    }
}

// ------------------------------------------------------
// PROGNOSE VK IN %
// IST-WERT = 100 %
// ------------------------------------------------------

function calculateForecastPercent(from, to, current) {
    const forecastFrom = Number(from);
    const forecastTo = Number(to);
    const currentValue = Number(current);

    if (!currentValue || Number.isNaN(forecastFrom) || Number.isNaN(forecastTo)) {
        return null;
    }

    return {
        from: forecastFrom / currentValue * 100,
        to: forecastTo / currentValue * 100
    };
}

function updateForecastPreview() {
    const result = calculateForecastPercent(
        $("forecastFrom")?.value,
        $("forecastTo")?.value,
        $("currentValue")?.value
    );

    $("forecastPreview").textContent = result
        ? `Prognose VK: ${formatPercent(result.from)} – ${formatPercent(result.to)} · IST-Wert = 100 %`
        : "Prognose VK: –";
}

// ------------------------------------------------------
// SORTIERUNG
// ------------------------------------------------------

function getSortedStocks() {
    const search = stockSearch.trim().toLocaleLowerCase("de");

    const list = stocks.filter((item) => {
        const matchesBranch =
            !branchFilter || item.branch === branchFilter;

        const matchesSearch =
            !search ||
            String(item.stockName || "")
                .toLocaleLowerCase("de")
                .includes(search);

        return matchesBranch && matchesSearch;
    });

    if (sortMode === "branch") {
        list.sort((a, b) =>
            String(a.branch || "").localeCompare(String(b.branch || ""), "de")
        );
    } else if (sortMode === "person") {
        list.sort((a, b) =>
            String(a.person || "").localeCompare(String(b.person || ""), "de")
        );
    } else {
        list.sort((a, b) =>
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );
    }

    return list;
}

// ------------------------------------------------------
// ANZEIGE
// ------------------------------------------------------

function renderStocks() {
    const list = getSortedStocks();

    $("entryCount").textContent = list.length;

    if (stocks.length === 0) {
        $("emptyState").innerHTML =
            "Noch keine Einträge vorhanden.<br>Lege unten den ersten Eintrag an.";
        $("emptyState").classList.remove("hidden");
    } else if (list.length === 0) {
        $("emptyState").innerHTML =
            "Keine passenden Einträge gefunden.<br>Bitte Filter oder Suchbegriff ändern.";
        $("emptyState").classList.remove("hidden");
    } else {
        $("emptyState").classList.add("hidden");
    }

    $("stockList").innerHTML = list.map((item) => {

        const forecast = calculateForecastPercent(
            item.forecastFrom,
            item.forecastTo,
            item.currentValue
        );

        const forecastPercent = forecast
            ? `${formatPercent(forecast.from)} – ${formatPercent(forecast.to)}`
            : "–";

        const savedSources = Array.isArray(item.sources) ? item.sources : (item.source ? [{ title: "Quelle", url: item.source }] : []);
        const source = savedSources.length
            ? `<div class="source-links">${savedSources.map((entry, index) => {
                const title = String(entry.title || `Quelle ${index + 1}`);
                const url = String(entry.url || "").trim();
                return isUrl(url)
                    ? `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(title)}</a>`
                    : `<span class="source-link">${escapeHtml(title)}${url ? `: ${escapeHtml(url)}` : ""}</span>`;
            }).join("")}</div>`
            : "Keine Quellen hinterlegt";

        const personClass =
            String(item.person || "").toLowerCase() === "billy"
                ? "person-billy"
                : "person-louis";

        const importanceClass =
            item.importance === "sehr-wichtig"
                ? "importance-sehr-wichtig"
                : item.importance === "wichtig"
                    ? "importance-wichtig"
                    : "";

        const importanceText =
            item.importance === "sehr-wichtig"
                ? " · ★ SEHR WICHTIG"
                : item.importance === "wichtig"
                    ? " · Wichtig"
                    : "";

        return `
        <article class="stock-card ${personClass} ${importanceClass}">
            <div class="card-top">
                <div>
                    <h3 class="stock-title">${escapeHtml(item.stockName)}</h3>
                    <div class="meta">
                        ${escapeHtml(item.branch || "")}${importanceText}
                    </div>
                </div>
                <span class="person-tag">${escapeHtml(item.person || "")}</span>
            </div>

            <div class="metrics">
                <div class="metric">
                    <span>FAIRER WERT</span>
                    <strong>${formatMoney(item.fairValue)}</strong>
                </div>
                <div class="metric">
                    <span>IST-WERT · 100 %</span>
                    <strong>${formatMoney(item.currentValue)}</strong>
                </div>
                <div class="metric">
                    <span>PROGNOSE VK</span>
                    <strong>${formatMoney(item.forecastFrom)} – ${formatMoney(item.forecastTo)}</strong>
                </div>
                <div class="metric">
                    <span>PROGNOSE VK IN %</span>
                    <strong>${forecastPercent}</strong>
                </div>
            </div>

            <div class="card-bottom">
                <span>Dividende: ${item.noDividend ? "keine" : formatPercent(item.dividend)}</span>
                <span>Angelegt: ${formatDate(item.createdAt)}</span>
                <span>${source}</span>
                <div class="card-actions">
                    <button type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Bearbeiten</button>
                    <button type="button" data-action="refresh" data-id="${escapeHtml(item.id)}">↻ Aktualisieren</button>
                    <button type="button" data-action="delete" data-id="${escapeHtml(item.id)}">Löschen</button>
                </div>
            </div>

            ${item.note ? `<div class="note">${escapeHtml(item.note)}</div>` : ""}
        </article>`;
    }).join("");
}

// ------------------------------------------------------
// FORMULAR
// ------------------------------------------------------

function addSourceRow(title = "", url = "") {
    const row = document.createElement("div");
    row.className = "source-row";
    row.innerHTML = `<input class="source-title" type="text" aria-label="Quellentitel" placeholder="Titel, z. B. Aktienfinder"><input class="source-url" type="text" aria-label="Quellenlink" placeholder="https://..."><button class="source-remove" type="button" aria-label="Quelle entfernen">Entfernen</button>`;
    row.querySelector(".source-title").value = title;
    row.querySelector(".source-url").value = url;
    row.querySelector(".source-remove").addEventListener("click", () => row.remove());
    $("sourceFields").appendChild(row);
}

function collectSources() {
    return [...document.querySelectorAll("#sourceFields .source-row")]
        .map((row) => ({
            title: row.querySelector(".source-title").value.trim(),
            url: row.querySelector(".source-url").value.trim()
        }))
        .filter((source) => source.title || source.url);
}

function showSources(sources, legacySource = "") {
    $("sourceFields").innerHTML = "";
    const list = Array.isArray(sources) && sources.length
        ? sources
        : (legacySource ? [{ title: "Bisherige Quelle", url: legacySource }] : []);
    if (list.length) list.forEach((source) => addSourceRow(source.title || "", source.url || ""));
    else addSourceRow();
}

function openForm() {
    $("formPanel").classList.remove("hidden");
    $("stockForm").reset();
    showSources([]);
    delete $("stockForm").dataset.editId;
    $("dividend").disabled = false;
    $("saveMessage").textContent = "";
    updateForecastPreview();
    $("formPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeForm() {
    $("formPanel").classList.add("hidden");
}

// ------------------------------------------------------
// LOGIN
// ------------------------------------------------------

$("loginBtn").addEventListener("click", async () => {
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    if (!email || !password) {
        $("loginMessage").textContent =
            "Bitte E-Mail-Adresse und Passwort eingeben.";
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        $("loginMessage").textContent = "";
    } catch (error) {
        console.error(error);
        $("loginMessage").textContent =
            "Anmeldung fehlgeschlagen. E-Mail und Passwort prüfen.";
    }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

// ------------------------------------------------------
// BUTTONS
// ------------------------------------------------------

$("addBtn").addEventListener("click", openForm);
$("addSourceBtn").addEventListener("click", () => addSourceRow());
$("closeForm").addEventListener("click", closeForm);
$("cancelBtn").addEventListener("click", closeForm);

["currentValue", "forecastFrom", "forecastTo"].forEach((id) => {
    $(id).addEventListener("input", updateForecastPreview);
});

$("noDividend").addEventListener("change", () => {
    $("dividend").disabled = $("noDividend").checked;
    if ($("noDividend").checked) $("dividend").value = "";
});

document.querySelectorAll(".sort-button").forEach((button) => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".sort-button").forEach((item) => {
            item.classList.remove("active");
        });

        button.classList.add("active");
        sortMode = button.dataset.sort || "date";
        renderStocks();
    });
});

$("branchFilter").addEventListener("change", (event) => {
    branchFilter = event.target.value;
    renderStocks();
});

$("stockSearch").addEventListener("input", (event) => {
    stockSearch = event.target.value;
    renderStocks();
});

// ------------------------------------------------------
// PINNWAND: ÖFFNEN, SENDEN, LÖSCHEN, BENACHRICHTIGUNGEN
// ------------------------------------------------------

$("inboxOpenBtn").addEventListener("click", () => setInboxVisible(true));
$("inboxBackBtn").addEventListener("click", () => setInboxVisible(false));
$("messagePopupClose").addEventListener("click", () => $("messagePopup").classList.add("hidden"));
$("messagePopupOpen").addEventListener("click", () => {
    $("messagePopup").classList.add("hidden");
    setInboxVisible(true);
});

const savedVolume = localStorage.getItem("aktienAbgleichNotificationVolume");
if (savedVolume !== null) $("notificationVolume").value = savedVolume;
const savedSound = localStorage.getItem("aktienAbgleichNotificationSound");
if (savedSound && $("notificationSound")) $("notificationSound").value = savedSound;
$("volumeValue").textContent = `${$("notificationVolume").value} %`;

$("notificationSound").addEventListener("change", (event) => {
    localStorage.setItem("aktienAbgleichNotificationSound", event.target.value);
});

$("notificationVolume").addEventListener("input", (event) => {
    const value = Number(event.target.value);
    localStorage.setItem("aktienAbgleichNotificationVolume", String(value));
    $("volumeValue").textContent = `${value} %`;
});

$("notificationEnableBtn").addEventListener("click", enableNotifications);
$("notificationTestBtn").addEventListener("click", () => {
    playNotificationSound();
    showToast("Test-Bling abgespielt.");
});

$("messageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!auth.currentUser) {
        $("messageFormStatus").textContent = "Bitte zuerst anmelden.";
        return;
    }

    const text = $("messageText").value.trim();
    if (!text) {
        $("messageFormStatus").textContent = "Bitte eine Nachricht eingeben.";
        return;
    }

    try {
        await addDoc(collection(db, "messages"), {
            sender: $("messageSender").value,
            text,
            important: $("messageImportant").checked,
            createdAt: serverTimestamp(),
            createdByUid: auth.currentUser.uid
        });
        $("messageText").value = "";
        $("messageFormStatus").textContent = "";
        showToast("Nachricht wurde an die Pinnwand geheftet.");
    } catch (error) {
        console.error("Nachricht konnte nicht gespeichert werden:", error);
        $("messageFormStatus").textContent =
            "Die Nachricht konnte nicht gespeichert werden. Bitte Firestore-Regeln prüfen.";
    }
});

$("messageList").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-message-delete]");
    if (!button) return;

    const id = button.dataset.messageDelete;
    if (!confirm("Diese Nachricht wirklich von der Pinnwand löschen?")) return;

    try {
        await deleteDoc(doc(db, "messages", id));
        showToast("Nachricht wurde gelöscht.");
    } catch (error) {
        console.error("Nachricht konnte nicht gelöscht werden:", error);
        showToast("Die Nachricht konnte nicht gelöscht werden. Bitte Firestore-Regeln prüfen.");
    }
});

// ------------------------------------------------------
// SPEICHERN
// ------------------------------------------------------

$("stockForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.target;
    const editId = form.dataset.editId || null;

    const currentValue = Number($("currentValue").value);
    const forecastFrom = Number($("forecastFrom").value);
    const forecastTo = Number($("forecastTo").value);

    if (!currentValue || !forecastFrom || !forecastTo || forecastFrom > forecastTo) {
        $("saveMessage").textContent =
            "Bitte IST-Wert und Prognose VK prüfen.";
        return;
    }

    if (!auth.currentUser) {
        $("saveMessage").textContent = "Bitte zuerst anmelden.";
        return;
    }

    const noDividend = $("noDividend").checked;

    const data = {
        person: $("person").value,
        branch: $("branch").value,
        stockName: $("stockName").value.trim(),
        fairValue: $("fairValue").value === "" ? null : Number($("fairValue").value),
        currentValue,
        forecastFrom,
        forecastTo,
        dividend: noDividend || $("dividend").value === ""
            ? null
            : Number($("dividend").value),
        noDividend,
        importance: $("importance").value,
        sources: collectSources(),
        note: $("note").value.trim(),
        updatedAt: serverTimestamp(),
        updatedByUid: auth.currentUser.uid
    };

    try {
        if (editId) {
            await updateDoc(doc(db, "stocks", editId), data);
        } else {
            await addDoc(collection(db, "stocks"), {
                ...data,
                createdAt: serverTimestamp(),
                createdByUid: auth.currentUser.uid
            });
        }

        const message =
            thanksMessages[Math.floor(Math.random() * thanksMessages.length)];

        showToast("✓ Gespeichert – " + message);
        $("saveMessage").textContent = "";
        closeForm();

    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        $("saveMessage").textContent =
            "Speichern fehlgeschlagen. Bitte Firebase-Einstellungen prüfen.";
    }
});

// ------------------------------------------------------
// BEARBEITEN / LÖSCHEN / AKTUALISIEREN
// ------------------------------------------------------

$("stockList").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "delete") {
        if (!confirm("Diesen Eintrag wirklich löschen?")) return;

        try {
            await deleteDoc(doc(db, "stocks", id));
            showToast("Eintrag wurde gelöscht.");
        } catch (error) {
            console.error(error);
            showToast("Der Eintrag konnte nicht gelöscht werden.");
        }
        return;
    }

    if (action === "edit") {
        const item = stocks.find((stock) => stock.id === id);
        if (!item) return;

        openForm();
        $("stockForm").dataset.editId = id;

        [
            "person",
            "branch",
            "stockName",
            "fairValue",
            "currentValue",
            "forecastFrom",
            "forecastTo",
            "dividend",
            "importance",
            "note"
        ].forEach((field) => {
            if ($(field)) $(field).value = item[field] ?? "";
        });

        showSources(item.sources || [], item.source || "");
        $("noDividend").checked = !!item.noDividend;
        $("dividend").disabled = !!item.noDividend;
        updateForecastPreview();
        return;
    }

    if (action === "refresh") {
        showToast(
            "↻ Die automatische Quellen-Aktualisierung wird als nächster Schritt ergänzt."
        );
    }
});

// ------------------------------------------------------
// FIREBASE LIVE-SYNCHRONISIERUNG
// ------------------------------------------------------

onAuthStateChanged(auth, (user) => {

    if (user) {
        $("loginSection").classList.add("hidden");
        $("appSection").classList.remove("hidden");
        $("logoutBtn").classList.remove("hidden");
        $("inboxOpenBtn").classList.remove("hidden");
        $("connectionStatus").textContent = "● Synchronisiert";

        if (unsubscribe) unsubscribe();

        const stocksQuery = query(
            collection(db, "stocks"),
            orderBy("createdAt", "desc")
        );

        unsubscribe = onSnapshot(
            stocksQuery,
            (snapshot) => {
                stocks = snapshot.docs.map((document) => ({
                    id: document.id,
                    ...document.data()
                }));
                renderStocks();
            },
            (error) => {
                console.error("Firestore-Fehler:", error);
                $("connectionStatus").textContent = "⚠ Datenbankfehler";
                showToast("Die Daten konnten nicht geladen werden.");
            }
        );

        if (unsubscribeMessages) unsubscribeMessages();
        firstMessageSnapshot = true;
        const messagesQuery = query(
            collection(db, "messages"),
            orderBy("createdAt", "desc")
        );
        unsubscribeMessages = onSnapshot(
            messagesQuery,
            (snapshot) => {
                const incoming = snapshot.docs.map((document) => ({
                    id: document.id,
                    ...document.data()
                }));

                if (!firstMessageSnapshot) {
                    const freshMessages = incoming.filter((message) =>
                        !knownMessageIds.has(message.id) &&
                        message.createdByUid !== auth.currentUser?.uid
                    );
                    freshMessages.forEach(notifyNewMessage);
                }

                knownMessageIds = new Set(incoming.map((message) => message.id));
                messages = incoming;
                firstMessageSnapshot = false;
                renderMessages();
                if (inboxVisible) markMessagesSeen();
            },
            (error) => {
                console.error("Nachrichten-Fehler:", error);
                $("notificationStatus").textContent =
                    "Pinnwand nicht erreichbar. Bitte Firestore-Regeln prüfen.";
            }
        );

    } else {
        $("loginSection").classList.remove("hidden");
        $("appSection").classList.add("hidden");
        $("logoutBtn").classList.add("hidden");
        $("connectionStatus").textContent = "Nicht angemeldet";

        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        if (unsubscribeMessages) {
            unsubscribeMessages();
            unsubscribeMessages = null;
        }

        $("inboxOpenBtn").classList.add("hidden");
        setInboxVisible(false);
        stocks = [];
        messages = [];
        knownMessageIds = new Set();
    }
});
