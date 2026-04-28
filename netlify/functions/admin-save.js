// netlify/functions/admin-save.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { businessId, type, data, token } = JSON.parse(event.body);

  // Basic token check — token must exist in sessionStorage (validated client-side)
  // For production add server-side token validation
  if (!token || !businessId) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) };
  }

  if (type === 'services') {
    // Delete existing services and replace
    await supabase.from('services').delete().eq('business_id', businessId);

    if (data.services && data.services.length > 0) {
      const rows = data.services.map((s, i) => ({
        business_id: businessId,
        name: s.name,
        duration: s.duration,
        price: s.price,
        sort_order: i
      }));
      const { error } = await supabase.from('services').insert(rows);
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
  }

  if (type === 'hours') {
    const { error } = await supabase
      .from('businesses')
      .update({
        working_days: data.workingDays,
        working_hours: data.workingHours
      })
      .eq('id', businessId);
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
