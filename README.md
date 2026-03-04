GitHub Browser Automation
---

**Objective**:

In this assignment, you will be writing a Puppeteer script to automate a series of actions on GitHub. Your script should:
1. Log in to GitHub using credentials from a JSON file.
2. Star a predefined list of repositories.
3. Create a new list of starred repositories named "Node Libraries".
4. Add the previously starred repositories to this list.

---

**Setup Instructions**:

1. Set up a new Node project by running `npm init -y` in your terminal within your project directory.
2. Install Puppeteer using the following command: `npm install puppeteer`.
3. Create a new `credentials.json` file in your project directory with the following structure:
```json
{
  "username": "YOUR_GITHUB_USERNAME",
  "password": "YOUR_GITHUB_PASSWORD"
}
```
Replace `YOUR_GITHUB_USERNAME` and `YOUR_GITHUB_PASSWORD` with your actual GitHub credentials. Ensure you do not share or commit this file to any public repository.

4. Write an `app.js` script to automate the actions described in the objective.

---

**Requirements**:

1. Your script should be able to successfully log in to GitHub using the credentials provided in the `credentials.json` file.
2. It should then navigate to each repository in the following list and star it:

    - cheeriojs/cheerio
    - axios/axios
    - puppeteer/puppeteer

3. Your script should then create a starred repositories list named "Node Libraries".
4. Finally, it should add all the starred repositories to the "Node Libraries" list.

---

**Submission Instructions**:

1. Before submitting, ensure that your `credentials.json` is excluded from your submission to keep your credentials secure.
2. Submit the rest of your project as normal with GitHub Classroom (your `node_modules` directory, and your `package.json` and `package-lock.json` files should automatically be excluded).

---

**Assessment**:

1. Your submitted code will be reviewed for clarity, correctness, and completeness. Ensure that all the `TODO` sections are addressed, and the application functions as expected both in the command line and the browser.

2. You may be called upon to explain your code and the decisions you made during the development process. Understanding the logic and reasoning behind your code is crucial.

---

**Hints**:
- Remember to take advantage of the provided hints in the code template.
- For managing timeouts and waits, use `await page.waitForTimeout()` or `await page.waitForSelector()`.
- You can use `console.log()` statements to debug your Puppeteer script.
