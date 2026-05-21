This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Mobile (iOS Simulator)

The app ships through Capacitor as a thin native shell over the Next.js web app.

Prerequisites (already installed on this machine):
- Xcode + iOS Simulator
- CocoaPods (`pod`)
- Node 22 (Capacitor CLI requires >=22). Installed at `/usr/local/opt/node@22/bin`.

One-time setup is already done — `ios/` exists. To run on the simulator:

```bash
# Terminal 1 — dev server, bound to LAN so the simulator can reach it
npm run dev:mobile

# Terminal 2 — sync web assets/config into the iOS project, open Xcode
PATH="/usr/local/opt/node@22/bin:$PATH" npm run ios
```

In Xcode, pick an iOS Simulator scheme (e.g. *iPhone 15 Pro*) and press **Run**.

### Backend URL

`capacitor.config.ts` defaults `server.url` to `http://10.0.0.160:3000` (this machine's LAN IP). If your IP changes, either:
- update `DEFAULT_DEV_URL` in `capacitor.config.ts`, or
- run with `CAPACITOR_SERVER_URL=http://<new-ip>:3000 npm run cap:sync`

For a production build, set `CAPACITOR_SERVER_URL=https://gotplans.app` before `cap sync`.

### Android

`npx cap add android` hasn't been run yet — add it when you're ready for Android Studio.

## Authentication

Auth is handled by NextAuth (config in `auth.ts` / `auth.config.ts`).

Providers:
- **Google** — enabled, credentials in `.env.local`.
- **Apple** — code wired up; the button only renders when `APPLE_CLIENT_ID` and `APPLE_CLIENT_SECRET` are set.
- **Email magic link** (nodemailer SMTP) — needs `EMAIL_SERVER` and `EMAIL_FROM`.

### Enabling Apple Sign-In

1. In [developer.apple.com](https://developer.apple.com) → Certificates, IDs & Profiles:
   - Create an **App ID** with Sign in with Apple capability (e.g. `com.gotplans.app`).
   - Create a **Services ID** (e.g. `com.gotplans.app.web`) — this becomes `APPLE_CLIENT_ID`.
   - Configure return URL: `https://<your-domain>/api/auth/callback/apple`.
   - Create a **Sign in with Apple key**, download the `.p8` file, note the Key ID.
2. Generate the client secret JWT (Apple requires this — it's not a static value). Use the snippet in [`next-auth` docs](https://authjs.dev/getting-started/providers/apple) or the `jose` library. The JWT expires every ~6 months; rotate it.
3. Set in `.env.local`:
   ```
   APPLE_CLIENT_ID=com.gotplans.app.web
   APPLE_CLIENT_SECRET=<signed-jwt>
   ```
4. Restart the dev server. The Apple button will appear on `/auth/signin`.
