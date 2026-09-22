/**
 * BIQ-0208 verification spike. Does not change production model.
 * Run: npx tsx scripts/verify-openai-program-api.ts
 */
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const tinySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'note'],
  properties: {
    ok: { type: 'boolean' },
    note: { type: 'string' },
  },
};

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    sdk: 'openai@4.104.0 (package.json lock)',
    has_api_key: Boolean(process.env.OPENAI_API_KEY),
    env_model: process.env.OPENAI_MODEL || null,
    env_program_model: process.env.OPENAI_PROGRAM_MODEL || null,
  };

  if (!process.env.OPENAI_API_KEY) {
    report.error = 'OPENAI_API_KEY is not set';
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000 });
  const hasResponses = typeof (openai as any).responses?.create === 'function';
  report.sdk_has_responses_create = hasResponses;

  try {
    const listed = await openai.models.list();
    const ids = listed.data.map((m) => m.id).sort();
    report.model_count = ids.length;
    report.models = ids;
    report.interesting_models = ids.filter((id) =>
      /gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4|mini|reasoning/i.test(id)
    );
  } catch (err: any) {
    report.models_list_error = err?.message || String(err);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'probe', strict: true, schema: tinySchema },
      },
      messages: [
        { role: 'system', content: 'Return JSON only.' },
        { role: 'user', content: 'Confirm structured output works.' },
      ],
    });
    report.chat_json_schema = {
      ok: true,
      model: completion.model,
      content: completion.choices[0]?.message?.content || '',
      usage: completion.usage || null,
    };
  } catch (err: any) {
    report.chat_json_schema = { ok: false, error: err?.message || String(err) };
  }

  if (hasResponses) {
    try {
      const response = await (openai as any).responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        input: 'Return JSON that structured output will constrain.',
        text: {
          format: {
            type: 'json_schema',
            name: 'probe',
            strict: true,
            schema: tinySchema,
          },
        },
      });
      report.responses_json_schema = {
        ok: true,
        model: response.model,
        output_text: response.output_text || '',
        usage: response.usage || null,
      };
    } catch (err: any) {
      report.responses_json_schema = { ok: false, error: err?.message || String(err) };
    }

    const reasoningCandidates = ((report.interesting_models as string[]) || []).filter((id) =>
      /^(o1|o3|o4|gpt-5)/i.test(id)
    );
    const reasoningModel = reasoningCandidates[0] || null;
    report.reasoning_candidate = reasoningModel;
    if (reasoningModel) {
      try {
        const reasoned = await (openai as any).responses.create({
          model: reasoningModel,
          reasoning: { effort: 'low' },
          input: 'Reply with a one-word acknowledgement.',
        });
        report.reasoning_effort = {
          ok: true,
          model: reasoned.model,
          output_text: String(reasoned.output_text || '').slice(0, 200),
          usage: reasoned.usage || null,
        };
        try {
          const follow = await (openai as any).responses.create({
            model: reasoningModel,
            previous_response_id: reasoned.id,
            input: 'Repeat your previous one-word reply exactly.',
          });
          report.previous_response_id = {
            ok: true,
            previous_id: reasoned.id,
            follow_id: follow.id,
            output_text: String(follow.output_text || '').slice(0, 200),
          };
        } catch (err: any) {
          report.previous_response_id = { ok: false, error: err?.message || String(err) };
        }
      } catch (err: any) {
        report.reasoning_effort = { ok: false, model: reasoningModel, error: err?.message || String(err) };
      }
    } else {
      report.reasoning_effort = { ok: false, error: 'No o-series or gpt-5 model visible to this key' };
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
