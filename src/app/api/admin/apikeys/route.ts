import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const name = body.name || 'Chave de API';

    // Generate a secure random key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const apiKey = `gm_${rawKey}`;

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: name,
        key: apiKey,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating API key:', error);
      return NextResponse.json({ error: 'Erro ao gerar chave de API' }, { status: 500 });
    }

    return NextResponse.json({ apiKey: data }, { status: 201 });
  } catch (error: any) {
    console.error('Error in apikeys POST:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID da chave é obrigatório' }, { status: 400 });
    }

    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting API key:', error);
      return NextResponse.json({ error: 'Erro ao revogar chave de API' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error in apikeys DELETE:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
