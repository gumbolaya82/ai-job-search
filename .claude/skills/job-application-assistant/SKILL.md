---
name: job-application-assistant
description: >
  Assists with job applications: evaluating job postings, tailoring CVs, writing cover letters,
  and preparing for interviews. Triggers on keywords like: job posting, job application, CV,
  cover letter, resume, interview prep, job fit, career, application, apply, ansøgning, stilling
allowed-tools: Read, Glob, Grep, WebFetch, WebSearch, Edit, Write, AskUserQuestion
framework_version: 1.0.1
---

# Job Application Assistant

---

## Active Profile (resolve before anything else)

Read `.active-profile` at the repo root and bind `<profile>` to its contents. Every
`profiles/<profile>/...` path below resolves against it. If `.active-profile` is
missing, or names a directory that does not exist under `profiles/`, stop and tell
the user to run `python tools/profile_manager.py list`.

---

## Workflow

When the user provides a job posting (URL or text), follow this workflow:

### Step 1: Research & Evaluate Fit
- Fetch the job posting content (use WebFetch for URLs)
- Analyze the posting for required competencies, keywords, and priorities
- Research the company (website, LinkedIn, mission, recent news)
- Score the posting against the candidate's profile using the framework in `04-job-evaluation.md`
- Present the evaluation table and verdict
- Suggest whether the candidate should call the employer before applying (see `04-job-evaluation.md` for guidance)
- Ask the user if they want to proceed with an application

### Step 2: Tailor CV
- Read the most relevant existing CV variant from `cv/` as a starting point
- Follow the guidelines in `05-cv-templates.md`
- Create `profiles/<profile>/cv/main_<company>_<role>.tex` with tailored content
- Adjust: profile statement, skills section, experience bullet emphasis, section order

### Step 3: Write Cover Letter
- Follow the writing style rules in `03-writing-style.md` (critical: no em-dashes, no cliches)
- Follow the template structure in `06-cover-letter-templates.md`
- Create `profiles/<profile>/cover_letters/cover_<company>_<role>.tex`
- Ensure the letter connects specific experience to the role requirements

### Step 4: Interview Preparation
- Follow the framework in `07-interview-prep.md`
- Prepare STAR-format answers for likely questions
- Identify role-specific talking points
- Draft questions the candidate should ask the interviewer

---

## Reference Files

**Shared framework**, in this skill directory. Same for every profile:

| File | Purpose |
|------|---------|
| `03-writing-style.md` | Tone, structure, do's and don'ts |
| `04-job-evaluation.md` | Scoring framework for job fit |
| `05-cv-templates.md` | LaTeX CV structure and tailoring rules |
| `06-cover-letter-templates.md` | LaTeX cover letter structure and tailoring rules |
| `07-interview-prep.md` | STAR examples, tough questions, roleplay guidelines |

**Profile data**, under `profiles/<profile>/`. One set per person:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | The candidate profile: identity, target sectors, deal-breakers |
| `01-candidate-profile.md` | Education, experience, skills, publications, awards |
| `02-behavioral-profile.md` | Behavioral assessment, strengths, ideal environments |
| `03-writing-style-patterns.md` | Phrasing patterns `/setup` inferred from past writing |
| `04-job-evaluation-profile.md` | Match areas, career goals, scoring calibration |
| `05-cv-templates-profile.md` | Profile statements, one per `TEMPLATE:<id>` marker |
| `06-cover-letter-patterns.md` | Cover-letter phrasing patterns |
| `07-interview-prep-profile.md` | STAR examples, one per `STAR:<n>` marker |

Files `04`, `05` and `07` come in pairs: the shared file holds the framework and
marks where profile content belongs with a `PROFILE-EXTENSION-POINT` marker; the
profile file holds that content. Read both.

---

## Quick Commands

The user may also ask for individual steps without the full workflow:
- "Evaluate this job posting" - Step 1 only
- "Write a CV for [company]" - Step 2 only
- "Write a cover letter for [role] at [company]" - Step 3 only
- "Help me prepare for an interview at [company]" - Step 4 only
- "What jobs should I look for?" - Career strategy discussion using profile + evaluation framework
