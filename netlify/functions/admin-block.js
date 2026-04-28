// netlify/functions/admin-block.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { businessId, action, blockData, blockId, token } = JSON.parse(event.body);

  if (!token || !businessId) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorised' }) };
  }

  if (action === 'add') {
    const { error } = await supabase.from('blocked_slots').insert({
      business_id: businessId,
      date: blockData.date,
      type: blockData.type,
      time: blockData.time || null,
      reason: blockData.reason || null
    });
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  if (action === 'remove') {
    const { error } = await supabase
      .from('blocked_slots')
      .delete()
      .eq('id', blockId)
      .eq('business_id', businessId);
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
