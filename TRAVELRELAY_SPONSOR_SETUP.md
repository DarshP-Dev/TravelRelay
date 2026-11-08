# TravelRelay — sponsor setup (Codex + PayPal AI Hackathon)

## Do this first: APIMatic PayPal TypeScript context for Codex

1. Open a terminal (PowerShell works) after Node.js is installed.
2. Run:

   ```bash
   npx skills add https://github.com/context-plugins/plugin-marketplace/tree/main/plugins/paypal/skills/typescript
   ```

3. If prompted to choose an assistant, choose Codex. Then restart Codex and ask it to identify and read the installed PayPal integration skills.
4. When it reaches the PayPal integration milestone, instruct Codex to use these skills to implement and test Orders v2, server-side capture verification, captured-payment refunds, and webhook handling.
5. Document meaningful use of APIMatic in the project README and Devpost submission. Installing a plugin alone is not enough to demonstrate meaningful use.

Note: APIMatic's generic `npx context-plugins install paypal` is also officially advertised, but its installer's GitHub README lists auto-detection for Claude/Cursor/VS Code. For standalone Codex, using the skills CLI is better documented. PayPal context skills are not your PayPal credentials. Never paste the PayPal Client Secret in prompts or source control.

Sources:
- https://paypalaihackathon.devpost.com/details/apimatic
- https://context.apimatic.io/plugins/paypal/
- https://github.com/context-plugins/plugin-marketplace

## Do this during Itinerary development: Bryntum

Official hackathon sponsor instructions show a 45-day trial and this install command:

```bash
npm install @bryntum/scheduler@npm:@bryntum/scheduler-trial
```

Before installation, ask Codex to check the exact React-compatible wrapper and the trial's deployment and open-source repository terms. Use Bryntum for the scheduling/time-slot editor and recovery rescheduling UI; keep TravelRelay's image-rich timeline as the primary Itinerary page.

Sources:
- https://paypalaihackathon.devpost.com/details/bryntum
- https://bryntum.com/download
- https://www.bryntum.com/products/scheduler/docs/guide/Scheduler/integration/react/guide

## Not required now

AG Grid analytics, Postman sponsor entry, Render hosting, and other sponsors can be added when the app has a demonstrable use case. The hackathon rules do not require sponsor tools.

## Codex prompt for setup verification

```text
Read TRAVELRELAY_DESIGN.md, section 11. Inspect the installed agent skills and report whether the APIMatic PayPal TypeScript Context Plugin is available to this Codex environment. Do not claim it is installed without checking. Do not implement PayPal yet. Record how we will meaningfully use it during checkout/refund development. Review Bryntum's hackathon trial terms and React wrapper and propose the safest integration point in Milestone 2; do not install Bryntum until the itinerary feature is being implemented. Do not add any real API keys to Git history.
```
