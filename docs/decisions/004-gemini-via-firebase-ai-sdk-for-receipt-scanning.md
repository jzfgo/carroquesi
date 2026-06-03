# ADR-004: Gemini via Firebase AI SDK for receipt scanning

**Status:** Accepted  
**Date:** 2024

## Context

Receipt scanning requires a multimodal model that can read a photo of a receipt and extract structured data (store name, date, line items with prices). We needed to choose both the model provider and how to call it.

| Approach | Notes |
|---|---|
| **OpenAI GPT-4o via backend** | Backend proxies the API call; API key stays server-side |
| **Gemini API direct (backend)** | Same pattern; Gemini instead of OpenAI |
| **Gemini via Firebase AI SDK (client-side)** | Client calls Gemini directly; Firebase App Check gates access |
| **Custom OCR pipeline** | Tesseract or similar; structured parsing on top |

## Decision

Use **Gemini** as the model, called **client-side via the Firebase AI SDK** (`firebase/ai`). Firebase App Check (reCAPTCHA v3 in production) authorizes the request without exposing an API key in the bundle. The backend is not in the critical path for the AI call — it only receives the parsed result for fuzzy matching and price application.

## Rationale

**No backend proxy needed.** Routing the image through the backend would add latency, bandwidth cost (receipt images are large), and a surface area for rate-limit errors. The Firebase AI SDK lets the client call Gemini directly with App Check as the auth gate.

**API key never in the client bundle.** A naive direct Gemini API call would require embedding a key in the frontend. The Firebase AI SDK resolves credentials server-side via App Check tokens — the client never sees the raw API key.

**Gemini over OpenAI for this stack.** Firebase Auth is already a Firebase dependency; adding Firebase AI SDK keeps the Google/Firebase surface cohesive. Gemini's multimodal performance on receipt photos is comparable to GPT-4o for this use case.

**Custom OCR was ruled out early.** Receipt layouts vary enormously across stores. A model-based approach handles variation (handwriting, logos, foreign characters) without a brittle parsing layer.

## Consequences

- **Accepted:** `VITE_RECAPTCHA_SITE_KEY` must be configured in production for App Check; without it, receipt scanning is disabled.
- **Accepted:** Client-side AI call means scan failures surface as client errors, not backend errors — error handling lives in `receiptAi.ts`.
- **Accepted:** In local dev, App Check enforcement is relaxed; the full security posture only applies in production.
- **Gained:** Backend stays out of the image transfer path; no bandwidth or latency overhead for large receipt photos.
- **Gained:** No API key rotation risk on the frontend — App Check tokens are short-lived and issued by Firebase.
- **Watch:** If the Firebase AI SDK drops Gemini support or pricing changes significantly, the fallback is a backend proxy to Gemini or OpenAI — `receiptAi.ts` is the only file that would need to change.
