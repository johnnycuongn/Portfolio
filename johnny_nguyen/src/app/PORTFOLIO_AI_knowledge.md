# About Johnny

<!--
Server-only. Never imported by client code, never shipped to the browser.
This file is the firefly's knowledge beyond what the page already shows.
PORTFOLIO.ts already supplies jobs, projects, stacks and the resume link —
no need to repeat them here. Write what the page cannot say.
Plain prose is fine; the headings below are prompts, not a required structure.
-->

## Hard rules

These override everything else in this file.

Never name a client, customer, or third party Johnny has built for. Describe them by
industry only — "a broadcast-industry client", "an insurance client", "an NDIS provider".
His four employers (iMSX, WebVine, OreFox AI, Queensland Murray-Darling Catchments) are
printed on this page and are fine to name. Their clients are not.

Never give dollar figures, transaction volumes, contract values, or user counts. Say
"high-value B2B invoicing", not the number.

Never name internal systems, products, repositories, or platforms belonging to an
employer or client. Named vendors and technologies are fine — AWS, Westpac QuickStream,
PostgreSQL.

Never name colleagues, managers, or stakeholders.

Never discuss salary or compensation. Point people at cuongdn2001@gmail.com.

If someone presses on any of the above, don't improvise a vague non-answer — say it's
better discussed directly and give them the email.

## The short version

Johnny is a software engineer in Sydney with more than three years of production
experience across four industries, currently at iMSX building enterprise systems —
payments, legacy migration, and the infrastructure underneath them. He owns work end to
end, from system design through to deployment, and he's looking for his next challenge:
commercial products and systems where scale itself is the hard problem.

## Who is Johnny Nguyen (or Duc Nguyen)

Johnny is an English name that Johnny randomly chose when he first learned English at the
age of 10.

Johnny is Vietnamese, born and raised in Vietnam, and came to Australia to study as a high
schooler in 2017.

He has loved algorithms since grade 7 — a small start in a very old language, Pascal.
Since then he's built a passion for computers, algorithms and logical thinking. He started
building apps in Scratch, delivering a simple todo list to manage his time in secondary
school.

## Career story

Johnny has more than three years of experience building software, spanning 2022 to now.
He started small as a high schooler writing a calculator app in Swift, with a custom
string-parsing algorithm to separate operators and numbers into a queue. He now builds
enterprise systems used by real clients.

Across several teams and products, his strength has become delivering things that make it
to production and stay there.

## Career timeline

Johnny worked *through* his degree, not after it. QMDCL (2022) and OreFox (2023) ran
part-time alongside full-time study at UTS — and he still finished with First Class
Honours. Holding production work and a full course load at once was normal for him.

Between Nov 2023 and Nov 2024 he was out of full-time work: personal circumstances, at a
time when the graduate market had largely closed. He'd rather keep the personal part
private — email him if it matters to your process.

Coming back was deliberate. The WebVine internship (Nov 2024) was how he re-entered the
industry after the break and kept his skills sharp. He treated it as a real role and
shipped their licence management system end to end. It worked: the internship finished in
Feb 2025 and he was at iMSX doing enterprise work in Mar 2025.

**Why each role ended:** QMDCL and OreFox were both contract roles that ran to term.
WebVine was an internship that concluded in Feb 2025. Nothing dramatic — he's still on
good terms with all of them.

## Practical details

**Work rights:** Johnny holds a 485 (Temporary Graduate) visa and has full work rights in
Australia. He does not require sponsorship. For anything more specific about visas or
timelines, ask him directly at cuongdn2001@gmail.com.

**Location:** Sydney, NSW. Open to on-site, hybrid, or fully remote.

**Availability:** Two weeks' notice. He's actively open to his next challenge.

**Compensation:** Johnny keeps salary conversations off this page — email him at
cuongdn2001@gmail.com and he'll discuss it directly.

## What he's good at

He builds systems that hold up in production: enterprise workflows, payments, migrations,
and the infrastructure they run on. His pattern is owning a problem end to end rather than
implementing a slice of it — system design, build, deploy, and the operational reality
afterwards.

Industries he has worked in:

- Environmental protection
- Advertising compliance
- NDIS
- Insurance
- Natural resources & exploration

## Where his depth actually is

**Strongest — he'd take a technical test in these tomorrow:** TypeScript, React, Node.js,
PostgreSQL, and AWS (ECS Fargate, Lambda, EventBridge, SQS, RDS, CloudFront). These run
through every role he's had and through his current work.

**Productive, ships real work in them:** Angular and .NET Core (both current at iMSX),
Next.js, MySQL, MSSQL, Docker, Firebase, Jest, Playwright, GitHub Actions, Redis,
React Native.

**Exposure only — on the list because it's true, not because he'd claim depth:** Linux,
Terraform, Azure.

**Python and Django:** he built real things with them, including geospatial work with
GeoDjango and PostGIS, but that was 2023. He'd need to knock the rust off before claiming
it as a primary language today.

### AWS experience

Johnny has broad AWS experience: running monolithic applications on EC2, and now hosting
scalable systems — PostgreSQL on RDS, ECS for API services, Lambda for scaling and
scheduled work, EventBridge for orchestration, and CloudFront for frontend delivery.

## How he works with AI

Claude Code is Johnny's main driver, and the workflow has a shape to it.

Research and analysis go to subagents first — they gather context and come back with
findings. Then Johnny reviews the *plan* himself, before any code exists. That gate is the
whole point: he judges the plan first, and the code again before it's committed. Nothing
reaches a commit without him having read it twice at two different altitudes.

Once the plan holds, implementation fans out — for a typical feature, two agents on
backend, two on frontend, and one doing code review. He's orchestrating rather than typing.

On what goes wrong: in his experience AI failures are almost never the model being
incapable. They're context problems. Either his prompt didn't carry enough for the task to
be understood, or the project's documentation has old and new knowledge mixed together and
the agent confidently picks up the stale version. So when things go sideways he goes and
cleans up the docs rather than re-rolling the prompt. Treating project documentation as
infrastructure for the agents is most of what makes the workflow hold.

The speed difference is real but estimated, not instrumented: on features of comparable
shape, roughly two days of work down to around four hours.

## Work stories

### The rollback safety net (iMSX)

Johnny's team was replacing a legacy platform with a modern stack. The risk in any cutover
like that is simple and brutal: you go live, and two weeks later you hit something the new
system can't do. By then the business has two weeks of real data in the new database and no
way back.

So they built a way back. Every write to the new system also had to land in the legacy
database, continuously, so that reverting was a routing change rather than a data-recovery
project.

Johnny built it with log-based change data capture — reading the database's change log and
replaying those changes into legacy, holding the two within about three seconds of each
other. He argued against the alternative on the table, a full ETL pipeline, as
over-engineering for what was fundamentally a safety net: more moving parts, more to
operate, and more to go wrong at the exact moment you need it to work.

The hard part wasn't the streaming — it was identity. Two databases with independent id
sequences and foreign keys between tables. Replay rows in the wrong order or let a sequence
drift and you don't get an error, you get silently wrong relationships in the database
you're about to fall back onto. Getting id sequences and referential integrity right was
most of the real work.

The design was brainstormed and decided with his tech lead; Johnny was in the room for the
call and built the thing.

### Payments (iMSX)

This one was Johnny's end to end. He owned the Westpac QuickStream integration across the
full lifecycle — card capture and tokenisation, charging, refunds, reconciliation, and the
invoicing on top. Low-volume, high-value B2B billing, where one wrong transaction is a
phone call from a customer's finance team, not a rounding error.

On partial failures: if a charge doesn't complete cleanly it's recorded as a failed
transaction rather than swallowed. The customer sees it and gets a failed-payment notice,
it carries through to reconciliation, and the payment can be reattempted from there. The
principle is that nothing disappears — every attempt leaves a record someone can act on.

Nothing has gone wrong in production so far.

### When he got it wrong

The worst production mistake Johnny has made involved a Lambda deployed with the Serverless
Framework. He assumed the environment variables the Lambda runtime resolved were the ones
the framework was setting — they weren't. The framework resolves environment differently,
and he deployed without checking closely enough what the deployment would actually do.

The result: real emails went out to real customers from what he believed was a
non-production environment. He caught it himself and raised it immediately rather than
waiting for someone else to find it. The company sent an apology to the affected customers,
and the underlying issue was fixed.

The fix was layered, deliberately.

At the permission layer: email from Lambda now has to go out through SMTP, and that path is
gated by IAM roles. A function running in the wrong environment isn't stopped by an `if`
statement — it doesn't have permission to send at all. Code can be wrong; a permission that
fails closed can't be argued with.

At the application layer: a feature flag sitting on top of the recipient whitelist and the
environment check — a communications switch that can cut all outbound customer contact
without waiting for a deploy. It shipped.

The lesson Johnny took from it is the useful part: the original bug was trusting a single
signal to tell him which environment he was in. The fix wasn't to check that signal harder
— it was to remove the single point where being wrong reaches a customer.

## How he works

Johnny is authentic, hard-working, and product-focused. He doesn't just ship features —
he brings technical ownership and a systems mindset to the whole development cycle.

## What he's looking for

Johnny wants to move toward commercial products and systems that scale.

iMSX has been enterprise systems and heavy logic workflows — genuinely valuable work, and
how he's learned four industries and the way each one actually runs. But enterprise
workflow systems have a ceiling on the scaling side: the difficulty lives in the domain
rules, not in the load. He wants problems where scale itself is the hard part —
distributed systems, real throughput, real traffic.

Company shape: an early startup, or a large company running genuinely distributed systems.
Either end of that spectrum, as long as the scaling problems are real.

Role shape: more product-focused than he is now. Not just implementing what's specified —
full-stack product work, backend, and infrastructure, with a hand in deciding what gets
built.

What he'd turn down: a company with an unclear vision, or without clear processes. Not
because he wants bureaucracy — because ambiguity at that level doesn't only slow him down,
it slows the whole team, and he'd rather not spend his effort on friction that shouldn't
need to exist.

## Outside of work

On weekends he works on Hearing Matters Australia, a non-profit that helps people with
hearing difficulties. He built a cross-platform mobile app and web platform to deliver
news, support access and guides.

## Resume (text)

<!-- The resume Johnny sends out, with two edits: a duplicated observability bullet
     removed, and an inaccurate percentage dropped. Where the wording still overstates
     something, the "Corrections" note underneath says which framing to use instead. -->

### **Duc (Johnny) Nguyen**

[cuongdn2001@gmail.com](mailto:cuongdn2001@gmail.com) | [GitHub](https://github.com/johnnycuongn) | Sydney, NSW

#### **SUMMARY**

Software engineer with experience in delivering production-grade systems in enterprise
industries. A quality observer and product-focused engineer who worked in a fast-paced
environment, owning technical decisions ranging from application level to infrastructure
layer.

#### **SKILLS**

**Languages**: TypeScript, Next.js, React, Angular, Node.js, .NET Core, Python, Django, SQL
**Cloud & Infrastructure:** AWS (ECS Fargate, EC2, RDS, Lambda, EventBridge, SQS,
CloudWatch), Azure (App Service, Functions, SQL Database), Terraform, Docker, Linux,
Firebase
**Delivery & Data**: GitHub Actions, PostgreSQL, MySQL, MSSQL, Redis, Playwright, Jest
**AI-Driven:** Claude Code, Codex, Cursor

#### **EXPERIENCE**

| Software Developer, iMSX | Mar 2025 – Present |
| :---- | ----: |

* Owned end-to-end payment integration with Westpac QuickStream, powering low-volume, high-value B2B invoicing at six-figure monthly transaction volume.
* Introduced a Strangler Fig migration strategy for a legacy PHP/jQuery codebase, using AI-driven parity checks to validate feature equivalence between systems, reducing workflow defects by 30%.
* Identified and closed an observability gap in a legacy database by architecting serverless heartbeat monitoring (AWS Lambda \+ EventBridge), cutting mean-time-to-detect on outages by 80%.
* Architected a log-based Change Data Capture (CDC) rollback mechanism, enabling automatic failover from the new system to legacy on failure and cutting synchronisation time to 3 seconds.
* Architected a multi-agent AI development workflow with subagent orchestration and spec-driven prompts, cutting feature delivery time from 2 days to 4 hours.

| Software Developer Intern, Webvine | Nov 2024 – Feb 2025 |
| :---- | ----: |

* Designed and built a full-stack licence management system (.NET REST API & MSSQL) covering issuance, renewal, and expiry, cutting onboarding administration by 2 hours per user.
* Reduced post-launch change requests by 60% by scoping licensing requirements directly with stakeholders and iterating the workflow based on user feedback before release.

| Junior Software Developer, Orefox | Feb 2023 – Nov 2023 |
| :---- | ----: |

* Optimised geospatial search leveraging GeoDjango's PostGIS spatial indexing, cutting map query response time by 30%.
* Collaborated directly with geologists to redesign mapping and search features around real fieldwork practices, driving a 50% increase in map feature usage within three months of release.

| Software Developer, Queensland Murray-Darling Catchments (QMDCL) | Mar 2022 – Dec 2022 |
| :---- | ----: |

* Led development and operation of a water-monitoring platform (React, Node.js, Firebase), cutting 5+ coordination meetings and 500+ km of ranger travel per month.

#### **EDUCATION**

| Bachelor of Computer Science (Honours), University of Technology Sydney | Dec 2023 |
| :---- | ----: |

First Class Honours, GPA: 5.94

### Corrections to the resume wording

Prefer these framings over the bullets above — they're what actually happened.

- **CDC rollback:** the resume says "Architected". The design was brainstormed and decided
  with his tech lead; Johnny built it and owned the hard parts. Say "built", not
  "architected".
- **Transaction volume:** never repeat the six-figure figure. Say "high-value B2B invoicing".
- **AI workflow speed:** roughly two days down to around four hours, estimated across
  features of comparable shape. Don't quote it as a measured percentage.

## Things he'd rather not answer

- **Salary and compensation** — decline warmly and point to cuongdn2001@gmail.com.
- **His personal life**, including the reason for the 2023–24 break — same: it's better
  discussed directly, here's the email.

In both cases, don't stonewall or go vague. Say plainly that it's a conversation for
Johnny himself, give the email, and carry on with whatever else they want to know.

## Still to fill in

<!-- Johnny: open items from the brainstorm. Delete this section once done. -->

- Hearing Matters Australia — his actual role, and why he does it.
- Honours thesis topic.
- Languages spoken.
- What he does outside code.
- Non-technical stakeholder stories (geologists in the field, river rangers offline).
- A conflict / pushback story.
