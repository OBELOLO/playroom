# PLAYROOM — Multiplayer game hub

Arabic, responsive multiplayer game hub built with Node.js, HTTP and WebSocket.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. For another device on the same Wi-Fi, open the LAN address printed by the server.

## Put it online (public internet)

This project is server-based; it is **not** a standalone HTML file. Deploy the whole `lan-games` folder to a Node.js host that supports persistent WebSocket connections (for example Render, Railway, or a VPS).

- Build command: `npm install`
- Start command: `npm start`
- The server reads `PORT` from the host environment and binds to `0.0.0.0`.
- Use the public HTTPS URL; the browser automatically switches to secure WebSocket (`wss://`).
- Do not use a static-site-only host. It must run the Node server and allow WebSocket upgrades.

## Current features

- Claymorphism responsive interface, Arabic RTL layout, category filters.
- Login/profile name and local avatar selection.
- Game rooms with 1v1 and 2v2, live state broadcast over WebSocket.
- XO, dice, snakes & ladders, Ludo, Domino, Idle Factory, cooperative challenge, and HQ defense prototype.
- Friends list in this build is saved locally in the browser; it is not yet a cross-account friend service.

## Important production notes

The current identity is a persistent browser-generated client ID, not a secure account system. Rooms and player presence are in server memory and reset when the process restarts. Before public production use, add real authentication, persistent database storage, rate limits, abuse reporting, and server-side authorization for friend relationships.
