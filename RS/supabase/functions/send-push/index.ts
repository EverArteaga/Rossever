// Supabase Edge Function: send-push
// Se dispara con un Database Webhook cada vez que se inserta una fila en "posts".
// Envía una notificación push a todos los dispositivos suscritos (el de Rossi).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') ?? '/';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!;
const CONTACT = Deno.env.get('VAPID_CONTACT') ?? 'mailto:ever@example.com';

webpush.setVapidDetails(CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    const payload = await req.json();
    const post = payload.record; // fila nueva de "posts" (la manda el Database Webhook)

    const title = 'Rossever';
    const body = post?.type === 'video' ? '🎬 Tienes un nuevo video de Ever' : '💌 Tienes una nueva cartita de Ever';

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs, error } = await supabase.from('push_subscriptions').select('*');
    if (error) throw error;

    const results = await Promise.allSettled(
      (subs ?? []).map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url: SITE_URL })
        )
      )
    );

    // Si una suscripción ya no es válida (410/404), se borra para no reintentarla siempre
    await Promise.all(
      results.map((r, i) => {
        if (r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode)) {
          return supabase.from('push_subscriptions').delete().eq('endpoint', subs[i].endpoint);
        }
      })
    );

    return new Response(JSON.stringify({ sent: results.length }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
