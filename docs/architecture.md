# RelayDesk Architecture

RelayDesk is a self-hosted Web Channel for Agent Runtime systems. The web application owns login, operator identity, local message/asset persistence, private chat history, reminders, and administration. Hermes/OpenClaw owns inference, tools, images, memory and the agent loop.

The application is a single Node.js Next.js deployment. Route handlers validate HTTP requests and call modules. UI components never access SQLite or a connector directly. Every runtime integration implements `RuntimeConnector`; the initial `MockConnector` keeps development and tests independent of the real Hermes protocol.

SQLite is on the local server disk and configured with WAL, foreign keys, `synchronous=NORMAL` and a five-second busy timeout. Files are stored under the configured data directory, never as BLOBs, and must remain under that directory after path resolution.
