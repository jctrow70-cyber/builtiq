import { NextResponse } from 'next/server';
import { lookupBarcode } from '../../../../lib/nutrition/barcodeLookup';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (authError || !user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const barcode = String(body?.barcode || '').trim();
  if (!barcode) {
    return NextResponse.json({ error: 'Enter or scan a barcode.' }, { status: 400 });
  }

  const result = await lookupBarcode(barcode);
  return NextResponse.json(result);
}
