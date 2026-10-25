# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private reporting instead: go to the **Security** tab of this repository and choose **Report a vulnerability** (if it is not shown, email saurabhpathak394@gmail.com).

Include what you found, steps to reproduce, and the version or commit. This is a solo-maintained hobby project, so there is no guaranteed response time, but reports are taken seriously.

## Scope

The server reads and writes one local JSON file and talks to its MCP client over stdio. It makes no network calls. Notes are stored as plain text without encryption. If `NOTES_CONFIRM_DELETE=1` is set, delete approval is handled by mcp-safe-actions; report problems in that flow here too. See the "Security design" section of the README for what is and is not covered.

## Supported versions

Only the latest release and the latest commit on `main` are supported.
