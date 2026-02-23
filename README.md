<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

<h1 align="center">Jouhayerk/ Onyx.mx</h1>

This repository contains the source code for the Onyx.mx inventory management application. This version is a beta release candidate intended for local testing and deployment.

## Run Locally

**Prerequisites:** [Node.js](https://nodejs.org/) (LTS version recommended)

1.  **Install dependencies:**
    Open your terminal in the project root and run:
    ```bash
    npm install
    ```

2.  **Set up environment variables:**
    Create a file named `.env.local` in the project root. Add your Gemini API key to this file:
    ```
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

The application should now be running on `http://localhost:3000`.

---

## Deployment

This project is built as a static site, which can be deployed to any modern hosting provider that supports static files.

### Build Process

1.  **Generate Production Assets:**
    Run the following command to build the application. This will create a `dist` directory in the project root containing the optimized, static files.
    ```bash
    npm run build
    ```

2.  **Configure Environment Variables:**
    Before deploying, you must configure the `GEMINI_API_KEY` environment variable in your hosting provider's settings. This is the same key you used in your `.env.local` file for local development.

    **Variable Name:** `GEMINI_API_KEY`
    **Value:** `YOUR_GEMINI_API_KEY`

### Hosting Recommendations

Here are instructions for a few popular hosting platforms.

#### Vercel

Vercel is a zero-configuration platform for static sites and serverless functions.

1.  Push your code to a Git repository (GitHub, GitLab, Bitbucket).
2.  Sign up for a Vercel account and connect it to your Git provider.
3.  Import your project repository.
4.  Vercel will automatically detect that it is a Vite project.
5.  Configure the project:
    *   **Build Command:** `npm run build` (should be automatically set)
    *   **Output Directory:** `dist` (should be automatically set)
    *   **Install Command:** `npm install` (should be automatically set)
6.  Add your `GEMINI_API_KEY` in the "Environment Variables" section of the project settings.
7.  Deploy. Vercel will automatically redeploy your application whenever you push changes to your Git repository.

#### Netlify

Netlify offers a similar workflow to Vercel.

1.  Push your code to a Git repository.
2.  Sign up for a Netlify account and connect it.
3.  Create a "New site from Git" and select your repository.
4.  Configure the build settings:
    *   **Build command:** `npm run build`
    *   **Publish directory:** `dist`
5.  Go to "Site settings" > "Build & deploy" > "Environment" and add your `GEMINI_API_KEY`.
6.  Deploy the site.

### General Instructions

For any other hosting provider, the general steps are:

1.  Run `npm run build` locally.
2.  Upload the contents of the generated `dist` directory to your hosting provider.
3.  Ensure the `GEMINI_API_KEY` environment variable is set for the build/runtime environment.