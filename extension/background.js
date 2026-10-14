
/* =========================================
   FOCUSFLOW BACKGROUND TRACKER
   + SMART TIMETABLE REMINDERS
========================================= */

const TRACKING_STATE_KEY = "trackingState";
const USAGE_DATA_KEY = "usageData";
const USAGE_DATE_KEY = "usageDate";
const TRACKING_ENABLED_KEY = "trackingEnabled";
const LAST_VISIT_KEY = "lastVisitByDomain";
const TIMETABLE_KEY = "focusflowTimetable";

const BACKEND_URL = "http://localhost:3000";

const SAVE_ALARM = "saveTrackingTime";
const TIMETABLE_ALARM = "checkTimetable";
const REMINDER_GRACE_MINUTES = 10;

/* =========================================
   DATE HELPERS
========================================= */

function getTodayKey() {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");
}

function getCurrentDayName() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[new Date().getDay()];
}

/* =========================================
   DOMAIN
========================================= */

function getDomain(url) {
  try {
    if (!url || !url.startsWith("http")) {
      return null;
    }

    return new URL(url)
      .hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch (error) {
    return null;
  }
}

/* =========================================
   TRACKING SETTING
========================================= */

async function ensureTrackingSetting() {
  const data = await chrome.storage.local.get(
    TRACKING_ENABLED_KEY
  );

  if (typeof data[TRACKING_ENABLED_KEY] !== "boolean") {
    await chrome.storage.local.set({
      [TRACKING_ENABLED_KEY]: true
    });
  }
}

async function isTrackingEnabled() {
  const data = await chrome.storage.local.get(
    TRACKING_ENABLED_KEY
  );

  return data[TRACKING_ENABLED_KEY] !== false;
}

/* =========================================
   DAILY RESET
========================================= */

async function ensureToday() {
  const data = await chrome.storage.local.get([
    USAGE_DATE_KEY,
    USAGE_DATA_KEY
  ]);

  const today = getTodayKey();

  if (data[USAGE_DATE_KEY] !== today) {
    await chrome.storage.local.set({
      [USAGE_DATE_KEY]: today,
      [USAGE_DATA_KEY]: {}
    });

    await chrome.storage.session.remove(
      TRACKING_STATE_KEY
    );
  }
}

/* =========================================
   SAVE CURRENT TRACKING TIME
========================================= */

async function saveCurrentTime() {
  const trackingEnabled = await isTrackingEnabled();

  if (!trackingEnabled) {
    return;
  }

  await ensureToday();

  const session = await chrome.storage.session.get(
    TRACKING_STATE_KEY
  );

  const state = session[TRACKING_STATE_KEY];

  if (!state || !state.domain || !state.startTime) {
    return;
  }

  const now = Date.now();
  const timeSpent = now - state.startTime;

  if (timeSpent <= 0) {
    return;
  }

  /* -----------------------------------------
     SAVE USAGE LOCALLY
  ----------------------------------------- */

  const data = await chrome.storage.local.get(
    USAGE_DATA_KEY
  );

  const usageData = data[USAGE_DATA_KEY] || {};

  if (!usageData[state.domain]) {
    usageData[state.domain] = 0;
  }

  usageData[state.domain] += timeSpent;

  await chrome.storage.local.set({
    [USAGE_DATA_KEY]: usageData
  });

  /* -----------------------------------------
     SYNC USAGE WITH BACKEND
  ----------------------------------------- */

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/usage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          domain: state.domain,
          duration: timeSpent,
          category: "Uncategorized",
          timestamp: new Date(now).toISOString()
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Usage API returned ${response.status}`
      );
    }

    console.log(
      "FocusFlow usage synced:",
      state.domain,
      Math.round(timeSpent / 1000),
      "seconds"
    );
  } catch (error) {
    console.error(
      "FocusFlow usage sync failed:",
      error.message
    );
  }

  /* -----------------------------------------
     UPDATE LAST VISITED TIME
  ----------------------------------------- */

  const visitData = await chrome.storage.local.get(
    LAST_VISIT_KEY
  );

  const lastVisitByDomain =
    visitData[LAST_VISIT_KEY] || {};

  lastVisitByDomain[state.domain] = now;

  await chrome.storage.local.set({
    [LAST_VISIT_KEY]: lastVisitByDomain
  });

  /* -----------------------------------------
     RESET SESSION TIMER
  ----------------------------------------- */

  await chrome.storage.session.set({
    [TRACKING_STATE_KEY]: {
      ...state,
      startTime: now
    }
  });
}

/* =========================================
   START TRACKING
========================================= */

async function startTracking(tab) {
  const trackingEnabled = await isTrackingEnabled();

  if (!trackingEnabled) {
    return;
  }

  await ensureToday();

  if (!tab || !tab.url) {
    return;
  }

  const domain = getDomain(tab.url);

  if (!domain) {
    await chrome.storage.session.remove(
      TRACKING_STATE_KEY
    );
    return;
  }

  const now = Date.now();

  const data = await chrome.storage.local.get(
    LAST_VISIT_KEY
  );

  const lastVisitByDomain =
    data[LAST_VISIT_KEY] || {};

  lastVisitByDomain[domain] = now;

  await chrome.storage.local.set({
    [LAST_VISIT_KEY]: lastVisitByDomain
  });

  await chrome.storage.session.set({
    [TRACKING_STATE_KEY]: {
      tabId: tab.id,
      domain,
      startTime: now
    }
  });

  console.log("FocusFlow tracking:", domain);
}

/* =========================================
   STOP TRACKING
========================================= */

async function stopTracking() {
  await saveCurrentTime();

  await chrome.storage.session.remove(
    TRACKING_STATE_KEY
  );
}

/* =========================================
   GET ACTIVE TAB
========================================= */

async function trackCurrentTab() {
  const trackingEnabled = await isTrackingEnabled();

  if (!trackingEnabled) {
    return;
  }

  const windows = await chrome.windows.getAll({
    populate: false
  });

  const focusedWindow = windows.find(
    window => window.focused
  );

  if (!focusedWindow) {
    return;
  }

  const tabs = await chrome.tabs.query({
    active: true,
    windowId: focusedWindow.id
  });

  if (tabs[0]) {
    await startTracking(tabs[0]);
  }
}

/* =========================================
   TIMETABLE SYNC
========================================= */

async function syncTimetable() {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/timetable`
    );

    if (!response.ok) {
      throw new Error(
        `Timetable API returned ${response.status}`
      );
    }

    const timetable = await response.json();

    await chrome.storage.local.set({
      [TIMETABLE_KEY]: timetable
    });

    console.log(
      "FocusFlow timetable synced:",
      timetable.length
    );

    return timetable;
  } catch (error) {
    console.log(
      "FocusFlow timetable sync failed:",
      error.message
    );

    const local = await chrome.storage.local.get(
      TIMETABLE_KEY
    );

    return local[TIMETABLE_KEY] || [];
  }
}

/* =========================================
   GET CACHED TIMETABLE
========================================= */

async function getTimetable() {
  const data = await chrome.storage.local.get(
    TIMETABLE_KEY
  );

  return data[TIMETABLE_KEY] || [];
}

/* =========================================
   TIME CONVERSION
========================================= */

function timeToMinutes(time) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

/* =========================================
   REMINDER STORAGE KEY
========================================= */

function getReminderKey(item) {
  return `timetableReminder_${item.id}_${getTodayKey()}`;
}

/* =========================================
   CHECK IF REMINDER ALREADY SENT
========================================= */

async function reminderAlreadySent(item) {
  const key = getReminderKey(item);
  const data = await chrome.storage.local.get(key);

  return data[key] === true;
}

/* =========================================
   MARK REMINDER SENT
========================================= */

async function markReminderSent(item) {
  const key = getReminderKey(item);

  await chrome.storage.local.set({
    [key]: true
  });
}

/* =========================================
   CHECK WHETHER USER VISITED DOMAIN
========================================= */

async function hasVisitedAroundSchedule(item) {
  const data = await chrome.storage.local.get(
    LAST_VISIT_KEY
  );

  const lastVisitByDomain =
    data[LAST_VISIT_KEY] || {};

  const lastVisit = lastVisitByDomain[item.domain];

  if (!lastVisit) {
    return false;
  }

  const now = new Date();
  const scheduledMinutes = timeToMinutes(item.time);

  if (scheduledMinutes === null) {
    return false;
  }

  const currentMinutes =
    now.getHours() * 60 + now.getMinutes();

  const difference = currentMinutes - scheduledMinutes;

  if (
    difference < -2 ||
    difference > REMINDER_GRACE_MINUTES
  ) {
    return false;
  }

  const lastVisitMinutes = Math.floor(
    lastVisit / 60000
  );

  const currentMinutesAbsolute = Math.floor(
    Date.now() / 60000
  );

  const minutesSinceVisit =
    currentMinutesAbsolute - lastVisitMinutes;

  return (
    minutesSinceVisit >= -2 &&
    minutesSinceVisit <= REMINDER_GRACE_MINUTES + 2
  );
}

/* =========================================
   SEND SMART REMINDER
========================================= */

async function sendTimetableReminder(item) {
  const notificationId =
    `focusflow_${item.id}_${getTodayKey()}`;

  const domain = item.domain || "your planned website";
  const time = item.time || "your scheduled time";

  await chrome.notifications.create(
    notificationId,
    {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "FocusFlow Reminder",
      message: `You planned to visit ${domain} at ${time}.`,
      priority: 2,
      requireInteraction: true,
      buttons: [
        { title: "Open Website" },
        { title: "Dismiss" }
      ]
    }
  );

  console.log(
    "FocusFlow reminder:",
    item.title,
    domain
  );
}

/* =========================================
   CHECK TIMETABLE
========================================= */

async function checkTimetable() {
  const timetable = await getTimetable();

  if (!timetable.length) {
    return;
  }

  const now = new Date();
  const currentDay = getCurrentDayName();

  const currentMinutes =
    now.getHours() * 60 + now.getMinutes();

  for (const item of timetable) {
    if (item.enabled === false) {
      continue;
    }

    if (
      !Array.isArray(item.days) ||
      !item.days.includes(currentDay)
    ) {
      continue;
    }

    const scheduledMinutes = timeToMinutes(item.time);

    if (scheduledMinutes === null) {
      continue;
    }

    if (currentMinutes < scheduledMinutes) {
      continue;
    }

    if (
      currentMinutes >
      scheduledMinutes + REMINDER_GRACE_MINUTES
    ) {
      continue;
    }

    if (await reminderAlreadySent(item)) {
      continue;
    }

    const completed = await hasVisitedAroundSchedule(item);

    if (completed) {
      await markReminderSent(item);

      console.log(
        "FocusFlow task completed:",
        item.title
      );

      continue;
    }

    await sendTimetableReminder(item);
    await markReminderSent(item);
  }
}

/* =========================================
   CREATE ALARMS
========================================= */

async function createFocusFlowAlarms() {
  await chrome.alarms.create(SAVE_ALARM, {
    periodInMinutes: 1
  });

  await chrome.alarms.create(TIMETABLE_ALARM, {
    periodInMinutes: 1
  });

  console.log("FocusFlow alarms created.");
}

/* =========================================
   EXTENSION STARTUP
========================================= */

chrome.runtime.onStartup.addListener(
  async () => {
    console.log("FocusFlow started.");

    await ensureTrackingSetting();
    await ensureToday();
    await createFocusFlowAlarms();
    await syncTimetable();

    const trackingEnabled = await isTrackingEnabled();

    if (trackingEnabled) {
      await trackCurrentTab();
    }
  }
);

/* =========================================
   EXTENSION INSTALLED
========================================= */

chrome.runtime.onInstalled.addListener(
  async () => {
    console.log("FocusFlow installed/updated.");

    await ensureTrackingSetting();
    await ensureToday();
    await createFocusFlowAlarms();
    await syncTimetable();

    const trackingEnabled = await isTrackingEnabled();

    if (trackingEnabled) {
      await trackCurrentTab();
    }
  }
);

/* =========================================
   TAB ACTIVATED
========================================= */

chrome.tabs.onActivated.addListener(
  async activeInfo => {
    const trackingEnabled = await isTrackingEnabled();

    if (!trackingEnabled) {
      return;
    }

    await saveCurrentTime();

    try {
      const tab = await chrome.tabs.get(
        activeInfo.tabId
      );

      await startTracking(tab);
    } catch (error) {
      console.log("FocusFlow tab error:", error);
    }
  }
);

/* =========================================
   URL CHANGED
========================================= */

chrome.tabs.onUpdated.addListener(
  async (tabId, changeInfo, tab) => {
    const trackingEnabled = await isTrackingEnabled();

    if (!trackingEnabled) {
      return;
    }

    if (!changeInfo.url) {
      return;
    }

    const session = await chrome.storage.session.get(
      TRACKING_STATE_KEY
    );

    const state = session[TRACKING_STATE_KEY];

    if (state && state.tabId === tabId) {
      await saveCurrentTime();
      await startTracking(tab);
    }
  }
);

/* =========================================
   TAB CLOSED
========================================= */

chrome.tabs.onRemoved.addListener(
  async tabId => {
    const session = await chrome.storage.session.get(
      TRACKING_STATE_KEY
    );

    const state = session[TRACKING_STATE_KEY];

    if (state && state.tabId === tabId) {
      await stopTracking();
    }
  }
);

/* =========================================
   WINDOW FOCUS CHANGED
========================================= */

chrome.windows.onFocusChanged.addListener(
  async windowId => {
    const trackingEnabled = await isTrackingEnabled();

    if (!trackingEnabled) {
      return;
    }

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await stopTracking();
      return;
    }

    await saveCurrentTime();

    try {
      const tabs = await chrome.tabs.query({
        active: true,
        windowId
      });

      if (tabs[0]) {
        await startTracking(tabs[0]);
      }
    } catch (error) {
      console.log("FocusFlow window error:", error);
    }
  }
);

/* =========================================
   ALARM HANDLER
========================================= */

chrome.alarms.onAlarm.addListener(
  async alarm => {
    if (alarm.name === SAVE_ALARM) {
      await saveCurrentTime();
      return;
    }

    if (alarm.name === TIMETABLE_ALARM) {
      await syncTimetable();
      await checkTimetable();
      return;
    }
  }
);

/* =========================================
   NOTIFICATION BUTTONS
========================================= */

chrome.notifications.onButtonClicked.addListener(
  async (notificationId, buttonIndex) => {
    if (!notificationId.startsWith("focusflow_")) {
      return;
    }

    const parts = notificationId.split("_");
    const timetableId = parts[1];

    const timetable = await getTimetable();

    const item = timetable.find(
      task => String(task.id) === String(timetableId)
    );

    if (buttonIndex === 0 && item) {
      let domain = item.domain;

      if (
        !domain.startsWith("http://") &&
        !domain.startsWith("https://")
      ) {
        domain = `https://${domain}`;
      }

      await chrome.tabs.create({ url: domain });
    }

    if (buttonIndex === 1) {
      await chrome.notifications.clear(notificationId);
    }
  }
);

/* =========================================
   NOTIFICATION CLICK
========================================= */

chrome.notifications.onClicked.addListener(
  async notificationId => {
    if (!notificationId.startsWith("focusflow_")) {
      return;
    }

    const parts = notificationId.split("_");
    const timetableId = parts[1];

    const timetable = await getTimetable();

    const item = timetable.find(
      task => String(task.id) === String(timetableId)
    );

    if (!item) {
      return;
    }

    let domain = item.domain;

    if (
      !domain.startsWith("http://") &&
      !domain.startsWith("https://")
    ) {
      domain = `https://${domain}`;
    }

    await chrome.tabs.create({ url: domain });
  }
);

/* =========================================
   TRACKING TOGGLE LISTENER
========================================= */

chrome.storage.onChanged.addListener(
  async (changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (!changes[TRACKING_ENABLED_KEY]) {
      return;
    }

    const enabled =
      changes[TRACKING_ENABLED_KEY].newValue;

    if (enabled === false) {
      await saveCurrentTime();

      await chrome.storage.session.remove(
        TRACKING_STATE_KEY
      );

      console.log("FocusFlow: Tracking OFF");
    } else {
      console.log("FocusFlow: Tracking ON");
      await trackCurrentTab();
    }
  }
);

/* =========================================
   POPUP MESSAGES
========================================= */

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message.type === "getUsageData") {
      (async () => {
        const trackingEnabled = await isTrackingEnabled();

        if (trackingEnabled) {
          await saveCurrentTime();
        }

        const data = await chrome.storage.local.get(
          USAGE_DATA_KEY
        );

        sendResponse({
          usageData: data[USAGE_DATA_KEY] || {}
        });
      })();

      return true;
    }

    if (message.type === "getTrackingStatus") {
      (async () => {
        const enabled = await isTrackingEnabled();

        sendResponse({
          trackingEnabled: enabled
        });
      })();

      return true;
    }

    if (message.type === "setTrackingStatus") {
      (async () => {
        const enabled = message.enabled === true;

        if (!enabled) {
          await saveCurrentTime();
        }

        await chrome.storage.local.set({
          [TRACKING_ENABLED_KEY]: enabled
        });

        if (!enabled) {
          await chrome.storage.session.remove(
            TRACKING_STATE_KEY
          );
        }

        sendResponse({
          success: true,
          trackingEnabled: enabled
        });
      })();

      return true;
    }

    if (message.type === "resetUsageData") {
      (async () => {
        await chrome.storage.local.set({
          [USAGE_DATA_KEY]: {}
        });

        await chrome.storage.session.remove(
          TRACKING_STATE_KEY
        );

        const trackingEnabled = await isTrackingEnabled();

        if (trackingEnabled) {
          await trackCurrentTab();
        }

        sendResponse({ success: true });
      })();

      return true;
    }

    if (message.type === "getTimetable") {
      (async () => {
        const timetable = await syncTimetable();

        sendResponse({
          success: true,
          timetable
        });
      })();

      return true;
    }
  }
);

/* =========================================
   INITIAL SAFETY SETUP
========================================= */

(async () => {
  try {
    await ensureTrackingSetting();
    await ensureToday();
    await createFocusFlowAlarms();
  } catch (error) {
    console.log(
      "FocusFlow initialization error:",
      error
    );
  }
})();
