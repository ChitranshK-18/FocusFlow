/* =========================================
   FOCUSFLOW POPUP
========================================= */


/* =========================================
   DEFAULT FOCUS GOAL
========================================= */

const DEFAULT_FOCUS_GOAL =
  5 * 60 * 60 * 1000;


/* =========================================
   FORMAT TIME
========================================= */

function formatTime(milliseconds) {

  const totalSeconds =
    Math.floor(milliseconds / 1000);


  const hours =
    Math.floor(totalSeconds / 3600);


  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );


  const seconds =
    totalSeconds % 60;


  if (hours > 0) {

    return `${hours}h ${minutes}m`;

  }


  if (minutes > 0) {

    return `${minutes}m ${seconds}s`;

  }


  return `${seconds}s`;

}


/* =========================================
   FORMAT GOAL TIME
========================================= */

function formatGoalTime(milliseconds) {

  const totalMinutes =
    Math.floor(milliseconds / 60000);


  const hours =
    Math.floor(totalMinutes / 60);


  const minutes =
    totalMinutes % 60;


  if (hours > 0) {

    return `${hours}h ${minutes}m`;

  }


  return `${minutes}m`;

}


/* =========================================
   GET FOCUS GOAL
========================================= */

async function getFocusGoal() {

  const data =
    await chrome.storage.local.get(
      "dailyFocusGoal"
    );


  return (
    data.dailyFocusGoal ||
    DEFAULT_FOCUS_GOAL
  );

}


/* =========================================
   SAVE FOCUS GOAL
========================================= */

async function saveFocusGoal(hours) {

  const goalMilliseconds =
    hours *
    60 *
    60 *
    1000;


  await chrome.storage.local.set({

    dailyFocusGoal:
      goalMilliseconds

  });


  return goalMilliseconds;

}


/* =========================================
   EDIT FOCUS GOAL
========================================= */

async function editFocusGoal() {

  const currentGoal =
    await getFocusGoal();


  const currentHours =
    Math.round(
      currentGoal /
      (60 * 60 * 1000)
    );


  const input =
    prompt(

      "Set your daily focus goal (in hours):",

      currentHours

    );


  if (
    input === null
  ) {

    return;

  }


  const hours =
    Number(input);


  if (
    !Number.isFinite(hours) ||
    hours <= 0 ||
    hours > 24
  ) {

    alert(
      "Please enter a goal between 1 and 24 hours."
    );

    return;

  }


  await saveFocusGoal(hours);


  await loadDashboard();

}


/* =========================================
   GET SETTINGS
========================================= */

async function getSettings() {

  const data =
    await chrome.storage.local.get([

      "productiveSites",

      "distractingSites"

    ]);


  return {

    productiveSites:

      data.productiveSites || [

        "leetcode.com",

        "github.com",

        "stackoverflow.com",

        "developer.mozilla.org"

      ],


    distractingSites:

      data.distractingSites || [

        "youtube.com",

        "instagram.com",

        "facebook.com",

        "twitter.com",

        "x.com"

      ]

  };

}


/* =========================================
   GET USAGE DATA
========================================= */

async function getUsageData() {

  return new Promise(

    resolve => {

      chrome.runtime.sendMessage(

        {

          type:
            "getUsageData"

        },

        response => {

          resolve(

            response?.usageData || {}

          );

        }

      );

    }

  );

}


/* =========================================
   CALCULATE PRODUCTIVITY
========================================= */

function calculateProductivity(

  usageData,
  productiveSites,
  distractingSites

) {

  let productiveTime = 0;

  let distractingTime = 0;


  for (
    const domain in usageData
  ) {

    const time =
      usageData[domain];


    if (
      productiveSites.includes(domain)
    ) {

      productiveTime +=
        time;

    }


    else if (
      distractingSites.includes(domain)
    ) {

      distractingTime +=
        time;

    }

  }


  const classifiedTime =

    productiveTime +
    distractingTime;


  let score = 0;


  if (
    classifiedTime > 0
  ) {

    score =
      Math.round(

        (
          productiveTime /
          classifiedTime
        ) * 100

      );

  }


  return {

    score,

    productiveTime,

    distractingTime

  };

}


/* =========================================
   UPDATE TOTAL TIME
========================================= */

function updateTotalTime(
  usageData
) {

  let totalTime = 0;


  for (
    const domain in usageData
  ) {

    totalTime +=
      usageData[domain];

  }


  document
    .getElementById(
      "totalTime"
    )
    .textContent =
      formatTime(totalTime);

}


/* =========================================
   UPDATE PRODUCTIVITY
========================================= */

function updateProductivity(
  score
) {

  document
    .getElementById(
      "productivityScore"
    )
    .textContent =
      score;


  document
    .getElementById(
      "progressBar"
    )
    .style.width =
      `${score}%`;

}


/* =========================================
   UPDATE FOCUS GOAL

   PRODUCTIVE TIME ONLY
========================================= */

async function updateFocusGoal(
  productiveTime
) {

  const dailyFocusGoal =
    await getFocusGoal();


  const percentage =
    Math.min(

      Math.round(

        (
          productiveTime /
          dailyFocusGoal
        ) * 100

      ),

      100

    );


  document
    .getElementById(
      "goalPercentage"
    )
    .textContent =
      percentage;


  document
    .getElementById(
      "goalProgressBar"
    )
    .style.width =
      `${percentage}%`;


  const completedTime =
    formatGoalTime(
      productiveTime
    );


  const goalTime =
    formatGoalTime(
      dailyFocusGoal
    );


  document
    .getElementById(
      "goalText"
    )
    .textContent =
      `${completedTime} of ${goalTime} completed`;

}


/* =========================================
   UPDATE WEBSITE LIST
========================================= */

function updateWebsiteList(
  usageData
) {

  const websiteList =
    document.getElementById(
      "websiteList"
    );


  websiteList.innerHTML =
    "";


  const sortedWebsites =

    Object.entries(
      usageData
    )

    .sort(
      (
        a,
        b
      ) => b[1] - a[1]
    )

    .slice(0, 5);


  if (
    sortedWebsites.length === 0
  ) {

    websiteList.innerHTML =

      `
      <p class="empty-message">
        Start browsing to see
        your activity here ✦
      </p>
      `;


    return;

  }


  sortedWebsites.forEach(

    (
      [
        domain,
        time
      ]
    ) => {


      const websiteItem =
        document.createElement(
          "div"
        );


      websiteItem.className =
        "website-item";


      websiteItem.innerHTML =

        `
        <span class="website-name">
          ${domain}
        </span>

        <span class="website-time">
          ${formatTime(time)}
        </span>
        `;


      websiteList.appendChild(
        websiteItem
      );

    }

  );

}


/* =========================================
   LOAD DASHBOARD
========================================= */

async function loadDashboard() {

  try {

    const usageData =
      await getUsageData();


    const settings =
      await getSettings();


    updateTotalTime(
      usageData
    );


    const productivity =
      calculateProductivity(

        usageData,

        settings.productiveSites,

        settings.distractingSites

      );


    updateProductivity(
      productivity.score
    );


    await updateFocusGoal(
      productivity.productiveTime
    );


    updateWebsiteList(
      usageData
    );

  }

  catch (error) {

    console.error(

      "FocusFlow error:",

      error

    );

  }

}


/* =========================================
   SETTINGS BUTTON
========================================= */

const settingsBtn =
  document.getElementById(
    "settingsBtn"
  );


if (settingsBtn) {

  settingsBtn.addEventListener(

    "click",

    () => {

      chrome.tabs.create({

        url:
          chrome.runtime.getURL(
            "settings.html"
          )

      });

    }

  );

}


/* =========================================
   EDIT GOAL BUTTON
========================================= */

const goalIcon =
  document.querySelector(
    ".goal-icon"
  );


if (goalIcon) {

  goalIcon.addEventListener(

    "click",

    editFocusGoal

  );


  goalIcon.title =
    "Edit focus goal";

}


/* =========================================
   MAKE GOAL CARD CLICKABLE
========================================= */

const focusGoalCard =
  document.querySelector(
    ".focus-goal-card"
  );


if (focusGoalCard) {

  focusGoalCard.addEventListener(

    "dblclick",

    editFocusGoal

  );

}


/* =========================================
   LOAD DASHBOARD
========================================= */

/* =========================================
   TRACKING TOGGLE
========================================= */

const dashboardToggle =
  document.getElementById("dashboardToggle");

const pausedToggle =
  document.getElementById("pausedToggle");

const dashboardScreen =
  document.getElementById("dashboardScreen");

const pausedScreen =
  document.getElementById("pausedScreen");


/* =========================================
   GET TRACKING STATUS
========================================= */

async function getTrackingStatus() {

  return new Promise((resolve) => {

    chrome.runtime.sendMessage(
      {
        type: "getTrackingStatus"
      },
      (response) => {

        resolve(
          response?.trackingEnabled !== false
        );

      }
    );

  });

}


/* =========================================
   SET TRACKING STATUS
========================================= */

async function setTrackingStatus(enabled) {

  return new Promise((resolve) => {

    chrome.runtime.sendMessage(
      {
        type: "setTrackingStatus",
        enabled: enabled
      },
      (response) => {

        resolve(response);

      }
    );

  });

}


/* =========================================
   UPDATE TOGGLE UI
========================================= */

function updateTrackingUI(enabled) {

  if (dashboardToggle) {

    dashboardToggle.checked =
      enabled;

  }


  if (pausedToggle) {

    pausedToggle.checked =
      enabled;

  }


  if (enabled) {

    dashboardScreen?.classList.add(
      "active"
    );

    pausedScreen?.classList.remove(
      "active"
    );

  }

  else {

    dashboardScreen?.classList.remove(
      "active"
    );

    pausedScreen?.classList.add(
      "active"
    );

  }

}


/* =========================================
   DASHBOARD TOGGLE
========================================= */

if (dashboardToggle) {

  dashboardToggle.addEventListener(
    "change",
    async () => {

      const enabled =
        dashboardToggle.checked;


      dashboardToggle.disabled =
        true;


      try {

        await setTrackingStatus(
          enabled
        );


        updateTrackingUI(
          enabled
        );


        if (enabled) {

          await loadDashboard();

        }

      }

      catch (error) {

        console.error(
          "FocusFlow toggle error:",
          error
        );

        dashboardToggle.checked =
          !enabled;

      }

      finally {

        dashboardToggle.disabled =
          false;

      }

    }
  );

}


/* =========================================
   PAUSED TOGGLE
========================================= */

if (pausedToggle) {

  pausedToggle.addEventListener(
    "change",
    async () => {

      const enabled =
        pausedToggle.checked;


      pausedToggle.disabled =
        true;


      try {

        await setTrackingStatus(
          enabled
        );


        updateTrackingUI(
          enabled
        );


        if (enabled) {

          await loadDashboard();

        }

      }

      catch (error) {

        console.error(
          "FocusFlow toggle error:",
          error
        );

        pausedToggle.checked =
          !enabled;

      }

      finally {

        pausedToggle.disabled =
          false;

      }

    }
  );

}


/* =========================================
   INITIALIZE TRACKING UI
========================================= */

async function initializeTrackingUI() {

  try {

    const enabled =
      await getTrackingStatus();


    updateTrackingUI(
      enabled
    );

  }

  catch (error) {

    console.error(
      "FocusFlow status error:",
      error
    );

    updateTrackingUI(
      true
    );

  }

}


/* =========================================
   START
========================================= */

initializeTrackingUI();

loadDashboard();