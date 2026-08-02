// Tests for historical-date handling, calorie totals, tolerance, editing,
// deletion, persistence and duplicate-submission prevention.
//
//   node --test tests/
//
// Every test boots a fresh copy of the real app (see harness.mjs) in local-only mode.

import test from "node:test";
import assert from "node:assert/strict";
import { loadApp, sleep } from "./harness.mjs";

// ---------------------------------------------------------------- date model

test("new entries land on the day being viewed, not on today", () => {
  const app = loadApp();
  const { CT } = app;
  const today = CT.todayKey();
  const past = CT.shiftDay(today, -5);

  assert.equal(CT.goToDay(past), true);
  const e = CT.addEntry(420, "arroz con pollo");

  assert.ok(e, "entry was created");
  assert.equal(CT.dayKeyOfEntry(e), past, "entry is stamped with the selected date");
  assert.equal(CT.state().viewDate, past, "the view stays on the historical day");
  assert.equal(CT.totalForDay(past), 420);
  assert.equal(CT.totalForDay(today), 0, "today's total is untouched");
});

test("future days cannot be selected or written to", () => {
  const app = loadApp();
  const { CT } = app;
  const tomorrow = CT.shiftDay(CT.todayKey(), 1);

  assert.equal(CT.goToDay(tomorrow), false);
  assert.equal(CT.goToDay("not-a-date"), false);
  assert.equal(CT.state().viewDate, CT.todayKey());
  assert.equal(CT.addEntry(200, "x", { day: tomorrow }), null);
});

test("the arrows and Today button move between days and flag past ones", () => {
  const app = loadApp();
  const { CT, document } = app;
  const flagRow = document.getElementById("dayFlagRow");

  assert.equal(flagRow.style.display, "none", "no flag on today");

  document.getElementById("prevDay").dispatch("click");
  assert.equal(CT.state().viewDate, CT.shiftDay(CT.todayKey(), -1));
  assert.equal(flagRow.style.display, "flex", "past-day flag is visible");
  assert.match(document.getElementById("pastFlag").textContent, /^Past day — /);

  document.getElementById("nextDay").dispatch("click");
  assert.equal(CT.state().viewDate, CT.todayKey());
  assert.equal(document.getElementById("nextDay").disabled, true, "can't go past today");

  document.getElementById("prevDay").dispatch("click");
  document.getElementById("todayBtn").dispatch("click");
  assert.equal(CT.state().viewDate, CT.todayKey());
  assert.equal(flagRow.style.display, "none");
});

// ------------------------------------------------------- totals recalculated

test("a day's total recalculates after add, edit and delete", () => {
  const app = loadApp();
  const { CT, document } = app;
  const past = CT.shiftDay(CT.todayKey(), -2);
  CT.goToDay(past);

  const a = CT.addEntry(300, "desayuno");
  CT.addEntry(500, "comida");
  assert.equal(CT.totalForDay(past), 800);

  // edit: 300 -> 450
  CT.openEdit(a.id);
  document.getElementById("editCal").value = "450";
  assert.equal(CT.saveEdit(), true);
  assert.equal(CT.totalForDay(past), 950);

  // delete the other one
  app.setConfirm(true);
  const other = CT.entriesForDay(past).find((e) => e.calories === 500);
  assert.equal(CT.deleteEntry(other.id), true);
  assert.equal(CT.totalForDay(past), 450);
  assert.equal(CT.entriesForDay(past).length, 1);
});

test("calorie sums still work when logging into a past day", () => {
  const app = loadApp();
  const { CT } = app;
  assert.equal(CT.parseCalories("200+150+30"), 380);
  const past = CT.shiftDay(CT.todayKey(), -1);
  CT.goToDay(past);
  CT.addEntry(CT.parseCalories("200+150"), "merienda");
  assert.equal(CT.totalForDay(past), 350);
});

// -------------------------------------------------------------- editing

test("editing the time keeps the entry on its own day", () => {
  const app = loadApp();
  const { CT, document } = app;
  const past = CT.shiftDay(CT.todayKey(), -3);
  CT.goToDay(past);
  const e = CT.addEntry(300, "cena");

  CT.openEdit(e.id);
  document.getElementById("editCal").value = "300";
  document.getElementById("editTime").value = "23:45";
  assert.equal(CT.saveEdit(), true);

  const saved = CT.entriesForDay(past)[0];
  assert.equal(CT.timeValue(saved.ts), "23:45");
  assert.equal(CT.dayKeyOfEntry(saved), past, "still on the selected date");
});

test("editing rejects invalid calories and leaves the entry alone", () => {
  const app = loadApp();
  const { CT, document } = app;
  const e = CT.addEntry(300, "avena");

  CT.openEdit(e.id);
  document.getElementById("editCal").value = "0";
  assert.equal(CT.saveEdit(), false);
  assert.match(app.lastAlert(), /between 1 and/);
  assert.equal(CT.entriesForDay(CT.todayKey())[0].calories, 300);

  document.getElementById("editCal").value = "999999";
  assert.equal(CT.saveEdit(), false);
  assert.equal(CT.entriesForDay(CT.todayKey())[0].calories, 300);
});

test("the edit modal changes description, calories and tolerance together", () => {
  const app = loadApp();
  const { CT, document } = app;
  const e = CT.addEntry(300, "old name");

  CT.openEdit(e.id);
  document.getElementById("editCal").value = "375";
  document.getElementById("editNote").value = "  yogur con granola  ";
  document.getElementById("editTol").children[1].dispatch("click"); // "Too much"
  assert.equal(CT.saveEdit(), true);

  const saved = CT.entriesForDay(CT.todayKey())[0];
  assert.equal(saved.calories, 375);
  assert.equal(saved.note, "yogur con granola");
  assert.equal(saved.tolerance, "much");
});

// -------------------------------------------------------------- deletion

test("deleting asks for confirmation first", () => {
  const app = loadApp();
  const { CT } = app;
  const past = CT.shiftDay(CT.todayKey(), -4);
  CT.goToDay(past);
  const e = CT.addEntry(275, "snack");

  app.setConfirm(false);
  assert.equal(CT.deleteEntry(e.id), false, "cancelled delete does nothing");
  assert.equal(CT.entriesForDay(past).length, 1);
  assert.equal(CT.totalForDay(past), 275);

  app.setConfirm(true);
  assert.equal(CT.deleteEntry(e.id), true);
  assert.equal(CT.entriesForDay(past).length, 0);
  assert.equal(CT.totalForDay(past), 0);
});

test("a deleted entry is tombstoned, not dropped, so the deletion can sync", () => {
  const app = loadApp();
  const { CT } = app;
  const e = CT.addEntry(200, "te con leche");
  app.setConfirm(true);
  CT.deleteEntry(e.id);

  const row = CT.state().data.entries.find((x) => x.id === e.id);
  assert.ok(row, "row is kept locally");
  assert.equal(row.deleted, true);
  assert.equal(row.dirty, true);
});

// ------------------------------------------------------------- tolerance

test("tolerance is optional and starts unset", () => {
  const app = loadApp();
  const { CT } = app;
  const e = CT.addEntry(400, "almuerzo");
  assert.equal(e.tolerance, null);
  assert.equal(CT.dayStatus(CT.todayKey()).code, "unrated");
});

test("tolerance can be set, changed and cleared after the fact, on any day", () => {
  const app = loadApp();
  const { CT } = app;
  const past = CT.shiftDay(CT.todayKey(), -6);
  CT.goToDay(past);
  const e = CT.addEntry(500, "pasta");

  assert.equal(CT.setTolerance(e.id, "ok"), true);
  assert.equal(CT.entriesForDay(past)[0].tolerance, "ok");

  CT.goToDay(CT.todayKey());               // rate it later, from a different day
  assert.equal(CT.setTolerance(e.id, "much"), true);
  assert.equal(CT.entriesForDay(past)[0].tolerance, "much");

  assert.equal(CT.setTolerance(e.id, null), true);
  assert.equal(CT.entriesForDay(past)[0].tolerance, null);
  assert.equal(CT.setTolerance(e.id, "bogus"), true);
  assert.equal(CT.entriesForDay(past)[0].tolerance, null, "unknown values mean unrated");
});

test("tolerance pills in the list rate a meal and toggle off when tapped twice", () => {
  const app = loadApp();
  const { CT, document } = app;
  CT.addEntry(300, "cereal");

  const li = document.getElementById("entriesList").children[0];
  const pills = li.children[1].children[2];               // info > tolerance control
  assert.equal(pills.children[0].getAttribute("data-v"), "ok");

  pills.children[0].click();
  assert.equal(CT.entriesForDay(CT.todayKey())[0].tolerance, "ok");

  const again = document.getElementById("entriesList").children[0].children[1].children[2];
  again.children[0].click();
  assert.equal(CT.entriesForDay(CT.todayKey())[0].tolerance, null, "tapping the active pill clears it");
});

test("daily status: unrated, partial, within and exceeded", () => {
  const app = loadApp();
  const { CT } = app;
  const day = CT.shiftDay(CT.todayKey(), -1);
  CT.goToDay(day);
  const a = CT.addEntry(300, "a");
  const b = CT.addEntry(400, "b");

  assert.equal(CT.dayStatus(day).code, "unrated");

  CT.setTolerance(a.id, "ok");
  const partial = CT.dayStatus(day);
  assert.equal(partial.code, "partial", "a partially rated day is not 'Within tolerance'");
  assert.notEqual(partial.code, "ok");
  assert.match(partial.label, /1\/2/);

  CT.setTolerance(b.id, "ok");
  assert.equal(CT.dayStatus(day).code, "ok");
  assert.equal(CT.dayStatus(day).label, "Within tolerance");

  CT.setTolerance(b.id, "much");
  assert.equal(CT.dayStatus(day).code, "exceeded");
  assert.equal(CT.dayStatus(day).label, "Exceeded tolerance");
});

test("one 'Too much' outweighs any number of OK meals", () => {
  const app = loadApp();
  const { CT } = app;
  const day = CT.todayKey();
  ["a", "b", "c"].forEach((n) => CT.setTolerance(CT.addEntry(200, n).id, "ok"));
  const bad = CT.addEntry(200, "d");
  CT.setTolerance(bad.id, "much");
  assert.equal(CT.dayStatus(day).code, "exceeded");
});

test("an empty day reports 'Not rated'", () => {
  const app = loadApp();
  const { CT } = app;
  assert.equal(CT.dayStatus(CT.shiftDay(CT.todayKey(), -9)).code, "unrated");
});

// ------------------------------------------------- guidance derived from logs

test("the 'too much' guidance is always readable and opens itself when needed", () => {
  const app = loadApp();
  const { CT, document } = app;
  const panel = document.getElementById("recoveryPanel");
  const summary = document.getElementById("recoverySummary");

  const e = CT.addEntry(600, "cena grande");
  assert.notEqual(panel.style.display, "none", "reachable even on a day with no 'Too much'");
  assert.equal(summary.textContent, "If a meal is too much — what to do");
  assert.ok(!panel.open, "stays collapsed until it is relevant");

  CT.setTolerance(e.id, "much");
  assert.equal(panel.open, true, "opens on a day that exceeded tolerance");
  assert.equal(summary.textContent, "A meal was too much — what to do next");

  panel.open = false;                       // user collapses it again
  CT.render();
  assert.equal(panel.open, false, "a re-render does not force it back open");

  CT.setTolerance(e.id, "ok");
  assert.equal(summary.textContent, "If a meal is too much — what to do");
});

test("step-up readiness needs three consecutive fully-OK days", () => {
  const app = loadApp();
  const { CT } = app;
  const rate = (offset, tol) => {
    const day = CT.shiftDay(CT.todayKey(), -offset);
    CT.goToDay(day);
    const e = CT.addEntry(400, "meal-" + offset);
    if (tol) CT.setTolerance(e.id, tol);
  };

  rate(1, "ok");
  rate(2, "ok");
  assert.equal(CT.progressReadiness().ready, false);
  assert.equal(CT.progressReadiness().streak, 2);

  rate(3, "ok");
  assert.equal(CT.progressReadiness().ready, true);

  CT.setTolerance(CT.entriesForDay(CT.shiftDay(CT.todayKey(), -2))[0].id, "much");
  assert.equal(CT.progressReadiness().ready, false, "a 'Too much' day breaks the streak");
});

test("the evening note fires only when the last meal is not the smallest", () => {
  const app = loadApp();
  const { CT } = app;
  const day = CT.shiftDay(CT.todayKey(), -1);
  CT.goToDay(day);
  const morning = CT.addEntry(500, "desayuno", { ts: CT.withTime(CT.tsForDay(day), "08:00") });
  const night = CT.addEntry(350, "cena", { ts: CT.withTime(CT.tsForDay(day), "21:30") });

  assert.equal(CT.eveningCheck(day), null, "smallest-last is fine");

  CT.setTolerance(night.id, null);
  night.calories = 700;                                  // now the last meal is the biggest
  const check = CT.eveningCheck(day);
  assert.ok(check, "flagged");
  assert.equal(check.last.id, night.id);
  assert.equal(check.smallest.id, morning.id);
  assert.equal(check.over, 200);
});

// ---------------------------------------------- duplicate-submission guards

test("an identical entry on the same day is rejected unless forced", () => {
  const app = loadApp();
  const { CT } = app;
  const first = CT.addEntry(300, "tostada");
  const second = CT.addEntry(300, "tostada");

  assert.ok(first);
  assert.equal(second, null, "duplicate rejected");
  assert.equal(CT.entriesForDay(CT.todayKey()).length, 1);
  assert.equal(CT.totalForDay(CT.todayKey()), 300);

  const forced = CT.addEntry(300, "tostada", { force: true });
  assert.ok(forced, "an intentional repeat is still possible");
  assert.equal(CT.totalForDay(CT.todayKey()), 600);
});

test("duplicate detection is per day and per meal", () => {
  const app = loadApp();
  const { CT } = app;
  CT.addEntry(300, "tostada");
  assert.ok(CT.addEntry(300, "otra cosa"), "different note is not a duplicate");
  assert.ok(CT.addEntry(301, "tostada"), "different calories is not a duplicate");

  const past = CT.shiftDay(CT.todayKey(), -1);
  CT.goToDay(past);
  assert.ok(CT.addEntry(300, "tostada"), "same meal on another day is not a duplicate");
});

test("pressing Add twice creates only one entry", async () => {
  const app = loadApp();
  const { CT, document } = app;
  app.setConfirm(true);                       // even if asked, the guard must block the 2nd press
  const form = document.getElementById("entryForm");
  const cal = document.getElementById("calInput");
  const note = document.getElementById("noteInput");

  cal.value = "250";
  note.value = "yogur";
  form.dispatch("submit");
  assert.equal(document.getElementById("addBtn").disabled, true, "button locks while submitting");

  cal.value = "250";                          // simulate the field still holding the value
  note.value = "yogur";
  form.dispatch("submit");

  assert.equal(CT.entriesForDay(CT.todayKey()).length, 1);
  assert.equal(CT.totalForDay(CT.todayKey()), 250);

  await sleep(320);
  assert.equal(document.getElementById("addBtn").disabled, false, "button unlocks afterwards");
});

test("submitting into a past day keeps the entry on that day", () => {
  const app = loadApp();
  const { CT, document } = app;
  const past = CT.shiftDay(CT.todayKey(), -7);
  CT.goToDay(past);

  document.getElementById("calInput").value = "310";
  document.getElementById("noteInput").value = "cena de ayer";
  document.getElementById("entryForm").dispatch("submit");

  assert.equal(CT.entriesForDay(past).length, 1);
  assert.equal(CT.entriesForDay(CT.todayKey()).length, 0);
  assert.equal(document.getElementById("calInput").value, "", "inputs clear after a successful add");
});

test("invalid calories are refused by the form", () => {
  const app = loadApp();
  const { CT, document } = app;
  document.getElementById("calInput").value = "abc";
  document.getElementById("entryForm").dispatch("submit");
  assert.equal(CT.entriesForDay(CT.todayKey()).length, 0);
  assert.match(app.lastAlert(), /between 1 and/);
});

// ------------------------------------------------------ per-entry time control

test("the time control on a row moves the meal within its own day", () => {
  const app = loadApp();
  const { CT, document } = app;
  const past = CT.shiftDay(CT.todayKey(), -3);
  CT.goToDay(past);
  const e = CT.addEntry(300, "cena", { ts: CT.withTime(CT.tsForDay(past), "19:00") });

  const input = document.getElementById("entriesList").children[0].children[1].children[1];
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.value, "19:00");

  input.value = "21:15";
  input.dispatch("change");

  const saved = CT.entriesForDay(past)[0];
  assert.equal(CT.timeValue(saved.ts), "21:15");
  assert.equal(CT.dayKeyOfEntry(saved), past, "still on the same date");
  assert.equal(saved.dirty, true, "queued for sync");
});

test("an unusable time is refused and the control snaps back", () => {
  const app = loadApp();
  const { CT, document } = app;
  const e = CT.addEntry(300, "comida", { ts: CT.withTime(Date.now(), "12:00") });

  assert.equal(CT.setEntryTime(e.id, "99:99"), false);
  assert.equal(CT.setEntryTime(e.id, ""), false);
  assert.equal(CT.timeValue(CT.entriesForDay(CT.todayKey())[0].ts), "12:00");

  const input = document.getElementById("entriesList").children[0].children[1].children[1];
  input.value = "aa:bb";
  input.dispatch("change");
  assert.equal(input.value, "12:00", "control shows the unchanged time again");
});

test("reordering follows the edited time", () => {
  const app = loadApp();
  const { CT } = app;
  const day = CT.todayKey();
  const a = CT.addEntry(200, "a", { ts: CT.withTime(Date.now(), "09:00") });
  const b = CT.addEntry(300, "b", { ts: CT.withTime(Date.now(), "13:00") });

  const order = () => CT.entriesForDay(day).map((e) => e.note).join(",");
  assert.equal(order(), "b,a", "newest first");
  CT.setEntryTime(a.id, "20:00");
  assert.equal(order(), "a,b", "moving 'a' to 20:00 puts it on top");
});

// ------------------------------------------------------------ persistence

test("entries, dates and tolerance survive a reload", () => {
  const first = loadApp();
  const past = first.CT.shiftDay(first.CT.todayKey(), -8);
  first.CT.goToDay(past);
  const e = first.CT.addEntry(410, "cena", { ts: first.CT.withTime(first.CT.tsForDay(past), "20:15") });
  first.CT.setTolerance(e.id, "much");

  const second = loadApp({ storage: first.storageDump() });
  const rows = second.CT.entriesForDay(past);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].calories, 410);
  assert.equal(rows[0].note, "cena");
  assert.equal(rows[0].tolerance, "much");
  assert.equal(second.CT.timeValue(rows[0].ts), "20:15");
  assert.equal(second.CT.totalForDay(past), 410);
  assert.equal(second.CT.dayStatus(past).code, "exceeded");
});

test("deletions survive a reload", () => {
  const first = loadApp();
  const e = first.CT.addEntry(220, "galletas");
  first.setConfirm(true);
  first.CT.deleteEntry(e.id);

  const second = loadApp({ storage: first.storageDump() });
  assert.equal(second.CT.entriesForDay(second.CT.todayKey()).length, 0);
  assert.equal(second.CT.totalForDay(second.CT.todayKey()), 0);
});

// --------------------------------------------------------- backward compat

test("entries stored before tolerance existed stay valid", () => {
  const probe = loadApp();
  const today = probe.CT.todayKey();
  const past = probe.CT.shiftDay(today, -2);
  const legacy = {
    "ct.syncCode": "test-sync-code",
    "ct.data": JSON.stringify({
      entries: [
        { id: "11111111-1111-4111-8111-111111111111", calories: 300, note: "viejo", ts: probe.CT.tsForDay(past), updated_at: Date.now() },
        { id: "22222222-2222-4222-8222-222222222222", calories: 250, note: "otro", ts: Date.now(), updated_at: Date.now() }
      ],
      meals: [], days: {}, target: 2000, target_updated_at: Date.now(), target_dirty: false
    })
  };

  const app = loadApp({ storage: legacy });
  const { CT } = app;
  assert.equal(CT.totalForDay(past), 300, "old entries still count toward their own day");
  assert.equal(CT.totalForDay(today), 250);
  assert.equal(CT.entriesForDay(past)[0].tolerance, null, "missing tolerance becomes unrated");
  assert.equal(CT.dayStatus(past).code, "unrated");
  assert.equal(CT.state().data.target, 2000, "unrelated data is preserved");

  // and they can be rated now
  CT.setTolerance(CT.entriesForDay(past)[0].id, "ok");
  assert.equal(CT.dayStatus(past).code, "ok");
});

test("the pre-sync local-only format still migrates", () => {
  const app = loadApp({
    storage: {
      "calorieTracker.v1": JSON.stringify({
        target: 1800,
        entries: [{ id: "a", calories: 500, note: "legacy", ts: Date.now() }]
      })
    }
  });
  const { CT } = app;
  assert.equal(CT.totalForDay(CT.todayKey()), 500);
  assert.equal(CT.entriesForDay(CT.todayKey())[0].tolerance, null);
  assert.equal(CT.state().data.target, 1800);
});
