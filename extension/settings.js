/* =========================================
   DEFAULT WEBSITES
========================================= */

const DEFAULT_PRODUCTIVE = [

  "leetcode.com",

  "github.com",

  "stackoverflow.com",

  "developer.mozilla.org"

];


const DEFAULT_DISTRACTING = [

  "youtube.com",

  "instagram.com",

  "facebook.com",

  "twitter.com",

  "x.com"

];


/* =========================================
   NORMALIZE DOMAIN
========================================= */

function normalizeDomain(
  input
) {

  let domain =
    input
      .trim()
      .toLowerCase();


  domain =
    domain.replace(
      /^https?:\/\//,
      ""
    );


  domain =
    domain.replace(
      /^www\./,
      ""
    );


  domain =
    domain.split("/")[0];


  return domain;

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


  const productiveSites =
    data.productiveSites ||
    DEFAULT_PRODUCTIVE;


  const distractingSites =
    data.distractingSites ||
    DEFAULT_DISTRACTING;


  return {

    productiveSites,

    distractingSites

  };

}


/* =========================================
   SAVE SETTINGS
========================================= */

async function saveSettings(
  productiveSites,
  distractingSites
) {

  await chrome.storage.local.set({

    productiveSites,

    distractingSites

  });

}


/* =========================================
   RENDER SITES
========================================= */

function renderSites(
  sites,
  containerId,
  type
) {

  const container =
    document.getElementById(
      containerId
    );


  container.innerHTML =
    "";


  sites.forEach(
    domain => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "site-item";


      const name =
        document.createElement(
          "span"
        );


      name.className =
        "site-name";


      name.textContent =
        domain;


      const removeButton =
        document.createElement(
          "button"
        );


      removeButton.className =
        "remove-btn";


      removeButton.textContent =
        "×";


      removeButton.addEventListener(

        "click",

        () => {

          removeSite(
            domain,
            type
          );

        }

      );


      item.appendChild(name);

      item.appendChild(
        removeButton
      );


      container.appendChild(
        item
      );

    }
  );

}


/* =========================================
   LOAD SETTINGS
========================================= */

async function loadSettings() {

  const settings =
    await getSettings();


  renderSites(

    settings.productiveSites,

    "productiveList",

    "productive"

  );


  renderSites(

    settings.distractingSites,

    "distractingList",

    "distracting"

  );

}


/* =========================================
   ADD SITE
========================================= */

async function addSite(
  type
) {

  const inputId =

    type === "productive"

      ? "productiveInput"

      : "distractingInput";


  const input =
    document.getElementById(
      inputId
    );


  const domain =
    normalizeDomain(
      input.value
    );


  if (!domain) {

    return;

  }


  const settings =
    await getSettings();


  if (
    type === "productive"
  ) {

    if (

      !settings.productiveSites.includes(
        domain
      )

    ) {

      settings.productiveSites.push(
        domain
      );

    }


    settings.distractingSites =

      settings.distractingSites.filter(
        site => site !== domain
      );

  }


  else {

    if (

      !settings.distractingSites.includes(
        domain
      )

    ) {

      settings.distractingSites.push(
        domain
      );

    }


    settings.productiveSites =

      settings.productiveSites.filter(
        site => site !== domain
      );

  }


  await saveSettings(

    settings.productiveSites,

    settings.distractingSites

  );


  input.value =
    "";


  loadSettings();

}


/* =========================================
   REMOVE SITE
========================================= */

async function removeSite(
  domain,
  type
) {

  const settings =
    await getSettings();


  if (
    type === "productive"
  ) {

    settings.productiveSites =

      settings.productiveSites.filter(
        site => site !== domain
      );

  }


  else {

    settings.distractingSites =

      settings.distractingSites.filter(
        site => site !== domain
      );

  }


  await saveSettings(

    settings.productiveSites,

    settings.distractingSites

  );


  loadSettings();

}


/* =========================================
   ADD BUTTONS
========================================= */

document
  .getElementById(
    "addProductiveBtn"
  )
  .addEventListener(

    "click",

    () => {

      addSite(
        "productive"
      );

    }

  );


document
  .getElementById(
    "addDistractingBtn"
  )
  .addEventListener(

    "click",

    () => {

      addSite(
        "distracting"
      );

    }

  );


/* =========================================
   ENTER KEY
========================================= */

document
  .getElementById(
    "productiveInput"
  )
  .addEventListener(

    "keydown",

    event => {

      if (
        event.key === "Enter"
      ) {

        addSite(
          "productive"
        );

      }

    }

  );


document
  .getElementById(
    "distractingInput"
  )
  .addEventListener(

    "keydown",

    event => {

      if (
        event.key === "Enter"
      ) {

        addSite(
          "distracting"
        );

      }

    }

  );


/* =========================================
   RESET DATA
========================================= */

document
  .getElementById(
    "resetBtn"
  )
  .addEventListener(

    "click",

    () => {

      const confirmed =
        confirm(

          "Reset today's activity data?"

        );


      if (!confirmed) {

        return;

      }


      chrome.runtime.sendMessage({

        type:
          "resetUsageData"

      });

    }

  );


/* =========================================
   BACK BUTTON
========================================= */

document
  .getElementById(
    "backBtn"
  )
  .addEventListener(

    "click",

    () => {

      window.close();

    }

  );


/* =========================================
   START
========================================= */

loadSettings();