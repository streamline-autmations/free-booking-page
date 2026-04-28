// netlify/functions/admin-auth.js
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { businessId, pin } = JSON.parse(event.body);

  if (!businessId || !pin) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  // Get the business and check PIN hash
  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, admin_pin_hash')
    .eq('id', businessId)
    .single();

  if (error || !business) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Business not found' }) };
  }

  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');

  if (pinHash !== business.admin_pin_hash) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect PIN' }) };
  }

  // Generate a simple session token (valid for this session only)
  const token = crypto.randomBytes(32).toString('hex');
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, businessId })
  };
};
