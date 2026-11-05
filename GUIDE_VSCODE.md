# Continue Epizo in VS Code

This is the **React version** of the Epizo project. It uses JSX components, React state and Vite's development server. The existing cinematic design and film binder are included.

## 1. Extract and open the project

1. Download the React project ZIP.
2. Extract the whole archive. On Windows, choose **Extract All**; on Mac, open the ZIP to decompress it.
3. Open VS Code and select **File → Open Folder**.
4. Choose the Epizo project folder containing `package.json`, `vite.config.js`, `src` and `public`.

Work in the extracted folder, not inside the ZIP. Do not open only `src` as the project root: the commands need the `package.json` beside it.

## 2. Check Node.js

Install [Node.js](https://nodejs.org/en/download) if necessary. This project requires **Node.js 22.12 or later**.

In VS Code, open **View → Terminal** and run:

```sh
node --version
npm --version
```

Both commands should print version numbers. If you just installed Node.js and the terminal cannot find it, close and reopen VS Code.

## 3. Install dependencies and start developing

From the folder containing `package.json`, run:

```sh
npm install
npm run dev
```

The first command installs React, Vite, Supabase, the TUS upload client and the test dependencies. This is required for the React project, even though the earlier plain JavaScript export did not need an installation step.

Open **http://127.0.0.1:5173** in your browser. Keep the terminal running while you work.

If Windows PowerShell blocks `npm.ps1`, use these equivalent commands:

```sh
npm.cmd install
npm.cmd run dev
```

If port 5173 is already occupied, stop the other development server or choose another port:

```sh
npm run dev -- --port 5174
```

Then use the address printed in the terminal. To stop the server, press **Ctrl+C** in that terminal, including on Mac.

## 4. Edit the React source

The most useful starting points are:

| What you want to change | Where to begin |
| --- | --- |
| Film binder movement and selection | `src/components/FilmBinder.jsx` |
| Binder spacing, depth, angles and shadows | `src/styles/binder.css` |
| Home page and featured films | `src/pages/HomePage.jsx` |
| Library filters and binder/grid layout | `src/pages/CataloguePage.jsx` |
| Subscription presentation | `src/pages/OffersPage.jsx` |
| Shared navigation and footer | `src/App.jsx` |
| State, favorites, profiles and dialog actions | `src/context/AppContext.jsx` |
| Film titles, synopses, images and plan data | `src/data/catalogue.js` |
| French and English interface text | `src/data/translations.js` |
| General visual style and mobile layout | `src/styles/cinema.css` and `src/styles/styles.css` |
| Images | `public/assets/` |

For example, open `src/pages/HomePage.jsx`, edit a piece of JSX, and save with **Ctrl+S** on Windows/Linux or **Cmd+S** on Mac. Vite updates the development page automatically. React may preserve local component state during the update; refresh manually if you want to restart the page.

JSX uses `className` for CSS classes and expressions inside braces, such as `{film.title}`. Keep component names capitalized when adding your own components.

To change the unconfigured demonstration, edit `src/data/catalogue.js`. To add a real film after backend setup, open `#admin`, create a draft, choose Film or Story, upload its poster and video, wait for server-confirmed processing, then publish. Public pages read published entries from Supabase. Do not add real private video URLs to the source catalogue.

**Do not edit `dist/` directly.** It is generated output. Your changes belong in `src/`, `public/` or the project configuration.

## 5. Test and build

Run the automated tests:

```sh
npm test
```

Create a production build:

```sh
npm run build
```

Or run both in sequence:

```sh
npm run check
```

The build creates `dist/`. To inspect that production build locally:

```sh
npm run preview
```

Open **http://127.0.0.1:4173**. Preview serves the built files, so rebuilding is necessary after source changes. Use `npm run dev` for the normal live-editing workflow.

Automated tests and a successful build do not replace visual checks. Before publishing, check the binder, filters, dialogs, favorites, phone layout and keyboard navigation in a browser.

## 6. Keep the lockfile and your work

Keep `package-lock.json` with the source. It records the exact resolved dependency versions. On a clean checkout with a valid lockfile, you can use:

```sh
npm ci
```

Use `npm install` for the normal first setup or when intentionally changing dependency declarations. Avoid editing the lockfile manually.

Save your project in your own Git repository when you are ready to keep version history or collaborate. The downloaded project is not automatically connected to any previously hosted site, and it contains no hosting credentials or authenticated repository connection.

## 7. Understand the current scope

The project is a React **web frontend**. It is not a React Native app and does not yet contain native Android or Smart TV applications.

Version 2 includes actual Supabase authentication code, an administrative interface, SQL security policies, Cloudflare Stream upload/playback functions, and a connected catalogue. No external service has been configured in this export. Without configuration, the film titles and illustrations are demonstration material, authentication is disabled, and the admin preview is empty. Follow `docs/BACKEND_SETUP.md` and `docs/AUTH_SETUP.md` to activate the integration. Payments, simultaneous-playback limits, device enforcement and DRM are still pending. No payment is collected. Simulated plans are disabled when the live backend is configured.

Preferences and favorites are stored locally for the browser address you use. Preferences from the hosted Site are not automatically transferred to your local development address. Using a different port or browser can create a separate local preference store.

The included images work locally. The Google Fonts referenced by the app need an Internet connection; fallback fonts are provided.

When you are ready to publish, run `npm run build` and deploy `dist/` through your chosen hosting workflow. Editing this local React folder never publishes changes by itself.

## 8. Activate authentication and administration

1. Follow `docs/BACKEND_SETUP.md` to create the database and deploy the Edge Functions.
2. Copy `.env.example` to `.env.local` and fill the Supabase project URL and **publishable** key.
3. Follow `docs/AUTH_SETUP.md` for email confirmation/SMTP, Google and Apple setup.
4. Enable a provider flag only after its setup is complete; restart Vite.
5. Open `http://127.0.0.1:5173/#connexion`, create and verify your account, then follow the backend guide to grant your own operator account its initial admin role.
6. Open `#admin` and enroll the required authenticator second factor.
7. Validate a small real upload, processing, publication and subscriber playback in your own staging environment.

Never put a service-role key, Cloudflare token, Apple secret or SMTP password into a `VITE_` variable or Git. The detailed guides separate public configuration from server secrets.
