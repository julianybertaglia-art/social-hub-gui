---
name: lynna-dashboard
description: |
  Guide for evolving Lynna's Next.js dashboard with consistent product UX, account-aware data, AI assistance, CRM, automations, content planning and analytics. Use this skill whenever adding or redesigning pages, navigation, forms, tables, account switching, Instagram integrations, AI features, CRM workflows, automations or visual themes in Lynna.
---

# Lynna Dashboard Development Guide

This guide adapts strong dashboard patterns from the Kiranism shadcn dashboard skill to Lynna's existing architecture. Do not blindly copy the source template or introduce Clerk, mock APIs, TanStack Query, shadcn/ui or a new folder structure unless the task specifically benefits from them and migration risk is understood.

## Product principle

Lynna should feel like a calm operating system for social media work. Every page should make four things obvious within seconds:

1. Which Instagram account/workspace is active.
2. What needs attention now.
3. What the user can do next.
4. What result or status changed after the action.

Prefer intent-based navigation over technical module names. Reduce visual noise. Avoid duplicated shells, duplicated status cards and pages that expose implementation details before the user's task.

## Current architecture

- Framework: Next.js App Router + React.
- Database/auth: Supabase.
- Instagram: Meta APIs under `app/api/instagram/`.
- WhatsApp/CRM: `app/whatsapp/` and `app/api/whatsapp/`.
- Automations: `app/automacoes/` and Instagram automation APIs.
- Global application shell: `app/HubFrame.js` + `app/hub-frame.module.css`.
- Global Lynna visual layer: `app/lynna-theme.css`.
- Home/content planning: `app/page.js`.

Preserve working Meta, Supabase, WhatsApp and automation integrations when redesigning UI.

## Navigation rules

Use one universal shell across all Lynna areas. Do not create another sidebar/topbar inside a feature page.

Primary navigation groups:

- Hoje: daily priorities and action summary.
- Conteúdo: calendar, tasks and ideas.
- Relacionamento: CRM/conversations and automations.
- Performance: metrics and goals.

Account switching belongs in the persistent top bar, not buried in settings.

## Account-aware rule

All Instagram-dependent data must be scoped by `account_id` or an equivalent stable account key. Never hardcode Gui Nonato's account ID in new feature logic.

The active account context should drive:

- profile header;
- metrics;
- content calendar and ideas when account-specific;
- CRM/lead source filters where applicable;
- Instagram automations;
- Lynna AI context;
- account permissions and connection status.

The account picker should show avatar, account name, @username and connection state, with an action to connect another account.

## AI assistant rule

Lynna AI must be contextual, not a generic chat box. It should know the active account, current page and permitted internal data.

Start with read/assist capabilities:

- summarize what needs attention today;
- explain account metrics and changes;
- suggest content ideas based on performance;
- turn an idea into a script/caption/CTA;
- summarize a selected lead conversation and suggest the next reply;
- identify follow-up opportunities;
- explain automation status.

Only add write/action tools after explicit confirmations for consequential actions such as sending messages, publishing content, changing automations or modifying CRM stages in bulk.

Prefer a persistent right-side assistant drawer available from any page. Also provide contextual suggested prompts based on the current page.

## Page pattern

Each operational page should generally contain:

1. Compact heading with purpose and current account context.
2. A short status/action summary only when it helps a decision.
3. Main work area.
4. Clear primary action.
5. Empty/loading/error states that explain what to do next.

Do not put setup/debug panels in the main workflow once an integration is working. Move diagnostics to a settings/connection area.

## Forms and tables

- Prefer labels that describe the user's task, not API fields.
- Use validation and concise inline errors.
- Keep destructive actions visually secondary and confirm them.
- For lead/content lists, support search, filters, status and next action.
- Persist filters in the URL only when sharing/reloading the view benefits the workflow.

## Visual system

Lynna identity:

- paper/warm neutral background;
- ink/dark text;
- wine/burgundy accent;
- light surfaces and restrained shadows;
- modern sans-serif typography;
- compact radii and spacing hierarchy;
- avoid the old black-and-gold Gui Social Hub identity;
- do not copy Argoplace colors or branding.

Use accent color to indicate selection, action and current context, not as decoration everywhere.

## Safety for refactors

Before replacing a working integration:

- identify API routes, environment variables and database tables it depends on;
- separate UI refactor from integration refactor when possible;
- work on a branch/preview first;
- preserve backward-compatible API shapes or update all callers together;
- run the repository build/tests before merge.

## Multi-account implementation target

Introduce an account model instead of a single fixed Instagram account. Recommended data concepts:

- `social_accounts`: Lynna workspace account records (`id`, `platform`, `platform_account_id`, `username`, `name`, `profile_picture_url`, `status`, timestamps).
- secure server-side credential mapping for account tokens/Meta authorization; do not expose tokens to the browser.
- a user's allowed accounts/workspaces when multiple Lynna users are introduced.
- active account selected client-side and passed to account-aware API routes.

Refactor Instagram routes to resolve the active account rather than constants such as `GUI_ACCOUNT_ID`.

## Definition of done

A Lynna change is not done only because it looks better. It is done when:

- navigation context is clear;
- current account is clear;
- the key action takes few steps;
- empty/error/loading states are useful;
- mobile remains usable;
- working integrations remain intact;
- build/tests pass.
