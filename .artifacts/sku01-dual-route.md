# SKU 01 Dual Route Polish

- Input: /Users/mac/openclaw/.artifacts/sku01-deepseek-compare.md
- Output model: gpt-4o
- Samples: 12

## Summary

- Avg DeepSeek words: 120.9
- Avg polished words: 75.3
- Avg style score: 90.1
- Avg logic score: 93.8
- Avg lexical ratio delta vs DeepSeek: 0.076

## Verdict

- The dual route closes the tone gap enough for premium-facing CyberFlow copy.
- Logic depth survives the second pass.

### 1. Inbox Zero Automation

- Style score: 92
- Logic score: 95
- DeepSeek words: 103
- Polished words: 87

**DeepSeek draft**

Create a reusable inbox zero automation system for a small team. Provide:

1. Goal: Clear, measurable objective (e.g., 'Process 100 emails daily with 95% accuracy').
2. Required Inputs: List specific data needed (e.g., email source, priority tags, sender domains).
3. Decision Rules: Concrete if-then logic (e.g., 'If email contains 'urgent' in subject, flag for immediate review').
4. Failure Points: Identify exact failure scenarios (e.g., 'Rule misclassifies 5% of emails').
5. Next Best Action: Specific, actionable step (e.g., 'Test rules on 50 sample emails by Friday').
   Output in a structured template the team can copy and use immediately.

**Polished**

Design a naval-inspired, repeatable inbox zero system for a small team. Deliver: 1. Goal: Define a precise target (e.g., 'Process 100 emails daily with 95% accuracy'). 2. Required Inputs: Specify data (e.g., email source, priority tags). 3. Decision Rules: Establish clear logic (e.g., 'If 'urgent' in subject, flag for review'). 4. Failure Points: Pinpoint failure scenarios (e.g., '5% misclassification'). 5. Next Best Action: Outline a concrete step (e.g., 'Test rules on 50 sample emails by Friday'). Format for immediate team use.

**Notes**

Streamlined for clarity and immediate application, maintaining a high-agency tone.

### 41. Meeting Notes Compression

- Style score: 92
- Logic score: 95
- DeepSeek words: 89
- Polished words: 64

**DeepSeek draft**

Compress meeting notes into a standardized summary. Input: raw meeting notes (text). Decision rules: 1. Extract key decisions, action items (with owners and deadlines), and unresolved topics. 2. Omit small talk, repetitions, and minor details. 3. Use bullet points for clarity. 4. If input lacks structure, infer sections from content. Constraints: Output must be under 300 words. Output format: Markdown with sections: Decisions, Action Items, Open Questions. Failure points: Missing deadlines/owners, unclear decisions, excessive length. Next best action: If failure points occur, flag for review by meeting organizer.

**Polished**

Standardize meeting note summaries. Input: raw notes. Rules: 1. Extract decisions, action items (with owners/deadlines), unresolved topics. 2. Exclude small talk, repetitions, minor details. 3. Use bullet points. 4. Infer sections if unstructured. Constraints: Max 300 words. Format: Markdown with Decisions, Action Items, Open Questions. Failure points: Missing deadlines/owners, unclear decisions, excessive length. Next action: Flag for organizer review if failures occur.

**Notes**

The prompt is concise and follows a clear, actionable structure, aligning with the target voice and execution style.

### 81. Proposal Drafting

- Style score: 90
- Logic score: 95
- DeepSeek words: 144
- Polished words: 106

**DeepSeek draft**

Create a reusable proposal drafting system for a small team. Provide concrete, actionable components in this exact JSON format: {"goal": "Specific, measurable objective for the proposal (e.g., 'Secure a $50K contract for web development services by Q3 2024')", "required_inputs": ["Client name and contact details", "Project scope document (max 500 words)", "Budget range from client", "Timeline requirements", "Team availability calendar"], "decision_rules": ["If budget is below $10K, propose a fixed-price model; otherwise, use time-and-materials.", "Include at least 3 past project references if client is new.", "Set proposal deadline to 7 days from receipt of all inputs."], "failure_points": ["Missing client budget leads to proposal rejection.", "Unclear scope causes timeline overruns >20%.", "Team unavailability delays start date by more than 2 weeks."], "next_best_action": "Assign a team member to gather missing inputs within 24 hours and schedule a kickoff meeting."}

**Polished**

Formulate a repeatable proposal system for a small team. Deliver in strict JSON: {"goal": "Define a clear, measurable proposal objective (e.g., 'Secure $50K web development contract by Q3 2024')", "required_inputs": ["Client details", "Project scope (max 500 words)", "Client budget", "Timeline requirements", "Team availability"], "decision_rules": ["If budget < $10K, use fixed-price; otherwise, time-and-materials.", "Include 3 past projects for new clients.", "Set proposal deadline 7 days post-input receipt."], "failure_points": ["No client budget = proposal rejection.", "Unclear scope = >20% timeline overrun.", "Team unavailability = >2-week start delay."], "next_best_action": "Assign team member to gather missing inputs in 24 hours and schedule kickoff."}

**Notes**

Streamlined for clarity and efficiency, maintaining focus on high-leverage actions.

### 121. Client Follow-up Systems

- Style score: 85
- Logic score: 90
- DeepSeek words: 64
- Polished words: 43

**DeepSeek draft**

Design a repeatable client follow-up system for a small team. Provide concrete details in this exact JSON format: {"goal": "string describing specific outcome", "required_inputs": ["list", "of", "concrete", "data", "items"], "decision_rules": [{"condition": "specific trigger", "action": "specific step"}], "failure_points": ["specific risk with mitigation"], "next_best_action": "immediate executable task"}. Use real examples like 'client last contacted date' or 'response rate threshold 40%'.

**Polished**

Craft a repeatable client follow-up system. Deliver in JSON: {"goal": "outcome", "required_inputs": ["data items"], "decision_rules": [{"condition": "trigger", "action": "step"}], "failure_points": ["risk with mitigation"], "next_best_action": "task"}. Use examples like 'client last contacted date' or 'response rate threshold 40%'.

**Notes**

Streamlined for clarity and efficiency, maintaining focus on actionable output.

### 161. Offer Packaging

- Style score: 92
- Logic score: 95
- DeepSeek words: 116
- Polished words: 79

**DeepSeek draft**

Create a repeatable system for offer packaging. Provide: 1. Goal: Increase conversion by 15% in 90 days through optimized offer structures. 2. Required Inputs: Customer segment (e.g., 'enterprise', 'SMB'), product/service list with pricing, competitor offers (if available), historical conversion data. 3. Decision Rules: If customer is enterprise, bundle core product with premium support; if SMB, offer tiered pricing with a free trial; always include a limited-time discount for new segments. 4. Failure Points: Missing competitor data leads to uncompetitive offers; unclear pricing causes customer confusion. 5. Next Best Action: Test top 3 offers with a pilot group of 50 customers and adjust based on feedback. Output in a table format for team reuse.

**Polished**

Systemize offer packaging. Deliver: 1. Goal: Boost conversion by 15% in 90 days via optimized offers. 2. Inputs: Customer segment, product/service pricing, competitor offers, conversion history. 3. Rules: For 'enterprise', bundle core with premium support; for 'SMB', use tiered pricing and free trial; always add a limited-time discount for new segments. 4. Failure Points: Lack of competitor data, unclear pricing. 5. Next Action: Pilot top 3 offers with 50 customers, refine from feedback. Present in table format.

**Notes**

Streamlined for clarity and immediate application, aligning with CyberFlow's high-agency style.

### 201. Short Video Scripting

- Style score: 85
- Logic score: 90
- DeepSeek words: 142
- Polished words: 104

**DeepSeek draft**

Create a reusable short video scripting system for a small team. Provide concrete details in this JSON format: {"goal": "specific video objective (e.g., increase product sign-ups by 15% in 30 days)", "required_inputs": {"target_audience": "demographic/psychographic details", "key_message": "single core takeaway", "call_to_action": "exact desired action", "video_length": "seconds (e.g., 15-60)", "platform": "e.g., Instagram Reels, TikTok"}, "decision_rules": ["rule1: prioritize visuals over text if platform is TikTok", "rule2: place CTA in first 5 seconds if goal is immediate action", "rule3: use trending audio if available and relevant"], "failure_points": ["point1: unclear CTA leading to low conversion", "point2: mismatched audience tone causing disengagement", "point3: exceeding length limits reducing completion rates"], "next_best_action": "specific immediate step (e.g., draft script using provided template, review with stakeholder by date)"}. Ensure all elements are actionable and testable.

**Polished**

Design a repeatable short video scripting system. Use this JSON structure: {"goal": "video objective (e.g., boost sign-ups by 15% in 30 days)", "required_inputs": {"target_audience": "demographic/psychographic", "key_message": "core takeaway", "call_to_action": "desired action", "video_length": "seconds (e.g., 15-60)", "platform": "e.g., Instagram Reels, TikTok"}, "decision_rules": ["rule1: prioritize visuals on TikTok", "rule2: CTA in first 5 seconds for immediate action", "rule3: use trending audio if relevant"], "failure_points": ["point1: unclear CTA", "point2: mismatched tone", "point3: length limits exceeded"], "next_best_action": "immediate step (e.g., draft script, review by date)"}. Ensure elements are actionable and testable.

**Notes**

Condensed structure aligns with naval-inspired style, focusing on clarity and actionability.

### 241. Sales Copy Iteration

- Style score: 92
- Logic score: 95
- DeepSeek words: 107
- Polished words: 57

**DeepSeek draft**

Create a reusable sales copy iteration system for a small team. Provide: 1. Goal: Increase conversion rate by 15% in 30 days. 2. Required inputs: Current copy (text), target audience (demographics/psychographics), key value propositions (list), A/B test results (if any). 3. Decision rules: If conversion rate increases by 5% or more, keep changes; if less than 5%, test new headline or CTA; if decreases, revert to previous version. 4. Failure points: Unclear audience targeting, inconsistent messaging, weak call-to-action. 5. Next best action: Implement A/B test with two variants, measure for 7 days, then apply decision rules. Output in a structured table format.

**Polished**

Develop a sales copy iteration system. Objective: Boost conversion by 15% in 30 days. Inputs: Current copy, audience data, value propositions, A/B results. Rules: >5% increase, retain; <5%, test new headline/CTA; decrease, revert. Watchpoints: Audience clarity, message consistency, CTA strength. Action: A/B test two variants for 7 days, apply rules. Deliver in table format.

**Notes**

Streamlined for clarity and actionability, maintaining a focused naval-inspired tone.

### 281. Lead Qualification

- Style score: 92
- Logic score: 95
- DeepSeek words: 138
- Polished words: 71

**DeepSeek draft**

Create a lead qualification system for a small team. Provide:

1. Goal: Qualify inbound leads to prioritize sales outreach.
2. Required Inputs: Lead source (e.g., website form, referral), company size (1-10, 11-50, 51-200, 200+ employees), budget range (<$10K, $10K-$50K, >$50K), and timeline (immediate, 1-3 months, 3+ months).
3. Decision Rules: Score leads 1-10 based on inputs: +3 for company size >50 employees, +3 for budget >$10K, +2 for timeline immediate, +1 for referral source. Qualify if score >=6.
4. Failure Points: Missing budget or timeline data, leads from unverified sources.
5. Next Best Action: For qualified leads (score >=6), assign to sales rep within 24 hours. For others, send automated follow-up email requesting missing info.
   Output in a table format with columns: Lead ID, Inputs, Score, Qualification Status, Next Action.

**Polished**

Establish a lead qualification system for a small team. Deliver: 1. Goal: Prioritize sales outreach by qualifying inbound leads. 2. Inputs: Lead source, company size, budget range, timeline. 3. Decision Rules: Score 1-10; qualify if score >=6. 4. Failure Points: Missing budget/timeline, unverified sources. 5. Next Action: Assign qualified leads to sales within 24 hours; request missing info for others. Format: Lead ID, Inputs, Score, Qualification Status, Next Action.

**Notes**

Streamlined for clarity and brevity; maintains core structure and actionable steps.

### 321. Research Compression

- Style score: 92
- Logic score: 95
- DeepSeek words: 115
- Polished words: 68

**DeepSeek draft**

Create a reusable research compression system for a small team. Provide:

1. Goal: Compress research documents into executive summaries (max 300 words) highlighting key findings, implications, and action items.
2. Required inputs: Source document (PDF, DOCX, or TXT), target audience (e.g., executives, technical team), and compression ratio (e.g., 10:1).
3. Decision rules: Prioritize data-driven insights over anecdotes; exclude redundant examples; maintain original citations; use bullet points for clarity.
4. Failure points: Input document exceeds 50 pages; unclear target audience; compression ratio below 5:1.
5. Next best action: If failure occurs, escalate to senior analyst for manual review and adjustment.
   Output in a structured template: [Goal], [Inputs], [Rules], [Failures], [Next Action].

**Polished**

Design a repeatable research compression system for a small team. Deliver: [Goal] - Summarize research to 300-word executive briefs with key insights and actions. [Inputs] - Source doc (PDF/DOCX/TXT), audience (executives/technical), ratio (10:1). [Rules] - Focus on data insights, exclude redundancy, keep citations, use bullets. [Failures] - Doc over 50 pages, unclear audience, ratio under 5:1. [Next Action] - Escalate to senior analyst for review if failure.

**Notes**

Streamlined for clarity and execution focus. Maintains essential details with minimal noise.

### 361. Standard Operating Procedures

- Style score: 92
- Logic score: 95
- DeepSeek words: 134
- Polished words: 47

**DeepSeek draft**

Transform the current standard operating procedures (SOPs) into a reusable system. Provide concrete details in this exact JSON format:
{
"goal": "[Specific, measurable outcome of the SOP]",
"required_inputs": ["List of specific data, documents, or resources needed"],
"decision_rules": ["Clear if-then rules for key choices, e.g., 'If X occurs, then do Y'", "Include thresholds or criteria"],
"failure_points": ["Specific steps where errors commonly happen, e.g., 'Step 3: Data entry errors due to manual input'", "Mitigation actions for each"],
"next_best_action": "[Immediate, actionable step to implement or test the SOP, e.g., 'Assign team member to validate Step 4 by Friday']"
}
Constraints: Use the current SOP document as the primary input. Ensure outputs are actionable for a team of 5-10 people. Avoid generic terms; specify roles, tools, or metrics where applicable.

**Polished**

Reforge SOPs into a tactical system. Deliver in JSON: {"goal": "[Target outcome]", "required_inputs": ["Essential resources"], "decision_rules": ["If-then logic"], "failure_points": ["Error zones"], "next_best_action": "[Immediate step]"). Base on current SOP. Tailor for a 5-10 person crew. Be precise with roles, tools, metrics.

**Notes**

The prompt is concise, focused on leveraging existing SOPs with clear execution steps. It maintains a high-agency tone suitable for a naval-inspired workflow.

### 401. Content Repurposing

- Style score: 85
- Logic score: 90
- DeepSeek words: 173
- Polished words: 87

**DeepSeek draft**

Transform the content repurposing task into a reusable system for a small team. Provide:

1. Goal: Repurpose one piece of source content into three distinct formats (e.g., blog post, social media post, email newsletter) within 48 hours.
2. Required Inputs: Source content (text, URL, or file), target audience description (demographics and interests), brand voice guidelines (3-5 key adjectives), and platform specifications (character limits, image requirements).
3. Decision Rules: Prioritize formats based on audience engagement data (e.g., highest click-through rate first), maintain consistent messaging across formats, and adapt tone to platform norms (e.g., casual for social media, formal for blogs).
4. Failure Points: Missing source content, unclear audience description, brand voice mismatch, or exceeding platform constraints. If any input is incomplete, halt and request clarification.
5. Next Best Action: If successful, schedule content distribution and track performance metrics (e.g., views, shares). If failed, document the issue and assign a team member to resolve it within 24 hours.
   Output in a structured template: Goal, Inputs, Rules, Failures, Next Action.

**Polished**

Forge a repeatable system for content repurposing. Deliver: 1. Goal: Transform source content into three formats (blog, social media, email) within 48 hours. 2. Inputs: Source content, audience profile, brand voice, platform specs. 3. Rules: Prioritize by engagement, ensure message consistency, adapt tone per platform. 4. Failures: Missing inputs, unclear audience, brand mismatch, platform limits. Halt if inputs are incomplete. 5. Next Action: Schedule distribution and track metrics if successful; document and resolve issues within 24 hours if failed. Use template: Goal, Inputs, Rules, Failures, Next Action.

**Notes**

Streamlined for clarity and efficiency. Maintains high agency and minimal noise.

### 441. Personal Productivity

- Style score: 92
- Logic score: 95
- DeepSeek words: 126
- Polished words: 91

**DeepSeek draft**

Transform the current personal productivity task into a reusable system for a small team. Provide: 1. Goal: A specific, measurable outcome (e.g., 'Reduce weekly email response time by 30% within 2 weeks'). 2. Required Inputs: List concrete items needed (e.g., 'Current email volume data, team availability schedule, email templates'). 3. Decision Rules: Define clear criteria for actions (e.g., 'If email is urgent, respond within 2 hours; if not, batch process daily at 3 PM'). 4. Failure Points: Identify specific risks (e.g., 'Team member unavailability, software downtime'). 5. Next Best Action: State one immediate, actionable step (e.g., 'Schedule a 30-minute team meeting tomorrow to review email data'). Output in a structured format like a table or bullet points for immediate reuse.

**Polished**

Convert a personal productivity task into a team-ready system. Deliver: 1. Goal: Define a measurable outcome (e.g., 'Cut email response time by 30% in 2 weeks'). 2. Inputs: List necessary resources (e.g., 'Email data, team schedules, templates'). 3. Rules: Set action criteria (e.g., 'Urgent emails: respond in 2 hours; others: batch at 3 PM'). 4. Risks: Note potential issues (e.g., 'Staff absence, tech failures'). 5. Action: Specify an immediate step (e.g., 'Plan a 30-minute team meeting to review data'). Present in a reusable format.

**Notes**

Streamlined for clarity and immediate application, maintaining a high-agency approach.
