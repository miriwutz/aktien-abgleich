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
    const list = [...stocks];

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
    $("emptyState").classList.toggle("hidden", list.length > 0);

    $("stockList").innerHTML = list.map((item) => {

        const forecast = calculateForecastPercent(
            item.forecastFrom,
            item.forecastTo,
            item.currentValue
        );

        const forecastPercent = forecast
            ? `${formatPercent(forecast.from)} – ${formatPercent(forecast.to)}`
            : "–";

        const source = item.source
            ? isUrl(item.source)
                ? `<a href="${escapeHtml(item.source)}" target="_blank" rel="noopener noreferrer">↗ Quelle öffnen</a>`
                : `Quelle: ${escapeHtml(item.source)}`
            : "Keine Quelle";

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

function openForm() {
    $("formPanel").classList.remove("hidden");
    $("stockForm").reset();
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
        source: $("source").value.trim(),
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
            "source",
            "note"
        ].forEach((field) => {
            if ($(field)) $(field).value = item[field] ?? "";
        });

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

    } else {
        $("loginSection").classList.remove("hidden");
        $("appSection").classList.add("hidden");
        $("logoutBtn").classList.add("hidden");
        $("connectionStatus").textContent = "Nicht angemeldet";

        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }

        stocks = [];
    }
});
