const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const LIST_NAME = 'node libraries';
const REPOSITORIES = ['cheeriojs/cheerio', 'axios/axios', 'puppeteer/puppeteer'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCredentials() {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  const raw = fs.readFileSync(credentialsPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed.username || !parsed.password) {
    throw new Error('credentials.json must include both "username" and "password" fields.');
  }

  return parsed;
}

async function clickFirstMatch(page, selectors) {
  return page.evaluate((selectorList) => {
    for (const selector of selectorList) {
      const element = document.querySelector(selector);
      if (element) {
        element.click();
        return true;
      }
    }
    return false;
  }, selectors);
}

async function login(page, credentials) {
  await page.goto('https://github.com/login', { waitUntil: 'domcontentloaded' });
  await page.type('#login_field', credentials.username, { delay: 20 });
  await page.type('#password', credentials.password, { delay: 20 });
  await page.click('[name="commit"]');

  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

  if (page.url().includes('sessions/two-factor') || page.url().includes('challenge')) {
    console.log('2FA or challenge required. Complete verification in the browser.');
  }

  await page.waitForFunction(
    () => {
      const hasProfileMenu = !!document.querySelector('summary[aria-label*="View profile and more"]');
      const actorMeta = document.querySelector('meta[name="octolytics-actor-login"]');
      return hasProfileMenu || (actorMeta && actorMeta.content);
    },
    { timeout: 180000 }
  );
}

async function getLoggedInUsername(page) {
  const metaUsername = await page.$eval('meta[name="octolytics-actor-login"]', (meta) => meta.content).catch(() => null);
  if (metaUsername) {
    return metaUsername;
  }

  await page.goto('https://github.com/settings/profile', { waitUntil: 'domcontentloaded' });
  const profileUsername = await page
    .$eval('input[name="user[login]"]', (el) => el.value.trim())
    .catch(() => null);

  if (!profileUsername) {
    throw new Error('Unable to determine logged-in GitHub username.');
  }

  return profileUsername;
}

async function ensureRepoIsStarred(page, repository) {
  await page.goto(`https://github.com/${repository}`, { waitUntil: 'domcontentloaded' });

  const alreadyStarred = await page.$('form[action*="/unstar"]');
  if (alreadyStarred) {
    console.log(`Already starred: ${repository}`);
    return;
  }

  const clicked = await clickFirstMatch(page, [
    'form[action*="/star"] button[type="submit"]',
    'button[aria-label*="Star this repository"]',
    'button[data-testid="star-button"]',
  ]);

  if (!clicked) {
    throw new Error(`Could not find a star button on ${repository}`);
  }

  await page.waitForSelector('form[action*="/unstar"]', { timeout: 10000 }).catch(() => {});
  console.log(`Starred: ${repository}`);
}

async function createListIfMissing(page, username, listName) {
  await page.goto(`https://github.com/${username}?tab=stars`, { waitUntil: 'networkidle2' });

  // Check if the list already exists in the sidebar
  const alreadyExists = await page.evaluate((name) => {
    const target = name.trim().toLowerCase();
    return Array.from(document.querySelectorAll('a, span, h2, h3, li')).some(
      (node) => node.textContent && node.textContent.trim().toLowerCase() === target
    );
  }, listName);

  if (alreadyExists) {
    console.log(`List already exists: ${listName}`);
    return;
  }

  // Wait until a "Create list" button or link is present in the DOM
  console.log('Waiting for "Create list" button...');
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button, a')).some(
        (el) => (el.textContent || '').trim().toLowerCase() === 'create list'
      ),
    { timeout: 15000 }
  );

  // Click it
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, a')).find(
      (el) => (el.textContent || '').trim().toLowerCase() === 'create list'
    );
    btn.click();
  });

  // Wait for the name input to appear
  await page.waitForFunction(
    () =>
      !!(
        document.querySelector('.js-user-list-name') ||
        document.querySelector('input[name="name"]') ||
        document.querySelector('input[placeholder*="ist"]')
      ),
    { timeout: 10000 }
  );

  const input =
    (await page.$('.js-user-list-name')) ||
    (await page.$('input[name="name"]')) ||
    (await page.$('input[placeholder*="ist"]'));

  await input.focus();
  await input.click({ clickCount: 3 });
  await page.keyboard.type(listName);
  await sleep(500);

  // Wait for the "Create" submit button to appear, then click it
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).some(
        (btn) => (btn.textContent || '').trim().toLowerCase() === 'create'
      ),
    { timeout: 10000 }
  );

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim().toLowerCase() === 'create'
    );
    btn.click();
  });

  await sleep(2000);
  console.log(`Created list: ${listName}`);
}

// Broad selector list for any element that could be the list dropdown trigger
const LIST_TRIGGER_SELECTORS = [
  '.js-user-list-menu',
  'button[aria-label*="Add this repository to a list"]',
  'button[aria-label*="list"]',
  'details[data-target*="list"]',
  'details.js-user-list-menu',
];

async function openStarListDropdown(page) {
  return page.evaluate((selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      // details elements need their summary clicked
      if (el.tagName === 'DETAILS') {
        const summary = el.querySelector('summary');
        if (summary) { summary.click(); return sel; }
      }
      el.click();
      return sel;
    }
    return null;
  }, LIST_TRIGGER_SELECTORS);
}

async function addRepoToList(page, repository, listName) {
  await page.goto(`https://github.com/${repository}`, { waitUntil: 'networkidle2' });

  const triggeredBy = await openStarListDropdown(page);
  if (!triggeredBy) {
    throw new Error(`Could not find list dropdown trigger for ${repository}`);
  }

  // Give the dropdown time to render
  await sleep(1500);

  // Log every candidate element so we can diagnose selector issues
  const candidates = await page.evaluate(() => {
    const ITEM_SELECTORS = [
      '.js-user-list-menu-form',
      '[role="menuitemcheckbox"]',
      '[role="option"]',
      '.SelectMenu-item',
      '.octicon-check ~ span',
      'li label',
    ];
    const seen = new Set();
    const results = [];
    for (const sel of ITEM_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        if (text && !seen.has(text)) {
          seen.add(text);
          results.push({ selector: sel, text });
        }
      }
    }
    return results;
  });

  console.log(`[${repository}] dropdown candidates:`, JSON.stringify(candidates));

  if (candidates.length === 0) {
    throw new Error(
      `List dropdown opened (via "${triggeredBy}") but found no list items for ${repository}. ` +
      `Check the console output above for what GitHub rendered.`
    );
  }

  // Try to click the matching list item using all the same selectors
  const selected = await page.evaluate((name) => {
    const target = name.trim().toLowerCase();
    const ITEM_SELECTORS = [
      '.js-user-list-menu-form',
      '[role="menuitemcheckbox"]',
      '[role="option"]',
      '.SelectMenu-item',
      'li label',
    ];
    for (const sel of ITEM_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if ((el.textContent || '').toLowerCase().includes(target)) {
          const checkbox = el.querySelector('input[type="checkbox"]');
          if (checkbox) {
            if (!checkbox.checked) checkbox.click();
          } else {
            el.click();
          }
          return true;
        }
      }
    }
    return false;
  }, listName);

  if (!selected) {
    throw new Error(
      `Could not find list "${listName}" in dropdown for ${repository}. ` +
      `Items visible: ${candidates.map((c) => `"${c.text}"`).join(', ')}`
    );
  }

  await sleep(800);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(300);
  console.log(`Added ${repository} to "${listName}"`);
}

async function main() {
  const credentials = loadCredentials();
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    await login(page, credentials);
    const username = await getLoggedInUsername(page);

    for (const repository of REPOSITORIES) {
      await ensureRepoIsStarred(page, repository);
    }

    await createListIfMissing(page, username, LIST_NAME);

    for (const repository of REPOSITORIES) {
      await addRepoToList(page, repository, LIST_NAME);
    }

    console.log('Automation complete.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Automation failed:', error.message);
  process.exitCode = 1;
});
