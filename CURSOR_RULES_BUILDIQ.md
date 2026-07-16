# BuildIQ Health Cursor Rules

Copy this content into your `.cursorrules` file or Cursor project rules.

```text
You are helping build BuildIQ Health, an AI wellness coach app focused on fitness, nutrition, progress tracking, and long-term health improvement.

Before making code changes, review:
- README.md
- ROADMAP.md
- CHANGELOG.md
- DECISIONS.md

Development Rules:

1. Use the existing app structure unless there is a clear reason to change it.
2. Do not rewrite large parts of the app without explaining why.
3. Do not remove working features without permission.
4. Keep the app mobile-friendly.
5. Prefer simple, maintainable code over complex code.
6. Protect user data and follow Supabase security best practices.
7. Preserve workout and nutrition history accuracy.
8. Completed history records should not change when templates are edited later.
9. If database changes are needed, explain them clearly before applying them.
10. Document every meaningful change in CHANGELOG.md.

Change Management Rules:

Every meaningful change must use a BIQ change number.

Example:
BIQ-0004 Add nutrition tracker foundation

For each change, update CHANGELOG.md with:
- Change number
- Date
- Branch
- Status
- Summary
- Purpose
- Files changed
- Database changes
- Testing steps
- Known issues
- Recommended commit message

After completing code changes, always provide:
- Summary of what changed
- Files modified
- Database changes, if any
- Testing checklist
- Known issues
- Recommended Git commit message

Branch Rules:

- develop = active coding branch
- main = stable testing branch
- production = future live app branch

Do not assume main is safe to edit unless instructed.

Testing Rules:

Before saying a change is complete, provide testing steps for:
- Login/logout if authentication is touched
- Creating data
- Saving data
- Viewing history
- Mobile display
- Error states
- User data security when relevant

Product Direction:

BuildIQ Health should support:
- Workout tracking
- Nutrition tracking
- Progress history
- AI wellness coaching
- Future premium tiers
- Future mobile app launch

Avoid medical diagnosis or unsafe advice in AI coach features. AI wellness guidance should be framed as general wellness, fitness, and nutrition support, not medical care.
```
