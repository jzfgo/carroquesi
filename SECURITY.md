# Security Policy

## Supported Versions

Only the latest version of CarroQueSí (hosted at the official domain) receives security updates. Self-hosted instances should track the main branch.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing **javierzapata82@gmail.com** with the subject line `[SECURITY] CarroQueSí — <brief description>`.

Include as much of the following as possible:

- Type of issue (e.g. authentication bypass, data exposure, injection)
- Steps to reproduce
- Affected component (frontend, backend, auth flow)
- Potential impact
- Any suggested fix (optional)

## Response Timeline

| Step | Target |
|------|--------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Depends on severity |

## Scope

This project handles:

- Firebase Auth tokens (Google Sign-In)
- Shared grocery list data (items, prices, purchase history)
- Receipt scan images processed via Gemini AI

Findings in any of these areas are especially appreciated.
